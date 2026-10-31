# ruff: noqa: INP001  (standalone script, not part of a package)
"""Check every installed npm and Python dependency against scripts/license-policy.toml.

Run with the workspace interpreter so Python metadata comes from the locked venv:

    uv run --locked python scripts/check_licenses.py

Exits 1 and prints name, version and license for every violation.
"""

from __future__ import annotations

import importlib.metadata
import json
import re
import shutil
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

POLICY_PATH = Path(__file__).with_name("license-policy.toml")
_TOKEN = re.compile(r"\(|\)|[A-Za-z0-9.+:-]+")
_NAME_RUN = re.compile(r"[-_.]+")
_OVERRIDE_LINE = re.compile(r'^\s*"([^"]+==[^"]+)"\s*=')


@dataclass(frozen=True)
class Package:
    """One installed dependency."""

    ecosystem: str
    name: str
    version: str
    license: str | None
    runtime: bool


def normalize(name: str) -> str:
    """Normalize a Python distribution name (PEP 503)."""
    return _NAME_RUN.sub("-", name).lower()


def run(*args: str) -> str:
    """Run a command found on PATH and return its stdout."""
    exe = shutil.which(args[0])
    if exe is None:
        msg = f"license-check: '{args[0]}' not found on PATH"
        raise SystemExit(msg)
    # Fixed argument lists built in this file; no shell, no user input.
    result = subprocess.run([exe, *args[1:]], capture_output=True, text=True, check=True)  # noqa: S603
    return result.stdout


class _SpdxEvaluator:
    """Recursive-descent evaluator for SPDX expressions using AND, OR and parentheses."""

    def __init__(self, tokens: list[str], allowed: frozenset[str]) -> None:
        self.tokens = tokens
        self.allowed = allowed
        self.position = 0

    def _peek(self) -> str | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def _take(self) -> str:
        current = self._peek()
        if current is None:
            raise ValueError
        self.position += 1
        return current

    def evaluate(self) -> bool:
        value = self._or()
        if self._peek() is not None:
            raise ValueError
        return value

    def _or(self) -> bool:
        value = self._and()
        while (self._peek() or "").upper() == "OR":
            self._take()
            right = self._and()
            value = value or right
        return value

    def _and(self) -> bool:
        value = self._atom()
        while (self._peek() or "").upper() == "AND":
            self._take()
            right = self._atom()
            value = value and right
        return value

    def _atom(self) -> bool:
        current = self._take()
        if current == "(":
            value = self._or()
            if self._take() != ")":
                raise ValueError
            return value
        if current.upper() in {")", "AND", "OR", "WITH"}:
            raise ValueError
        return current in self.allowed


def spdx_allowed(expression: str, allowed: frozenset[str]) -> bool:
    """Return True when the SPDX expression is satisfied by the allowed IDs.

    Any construct other than AND, OR and parentheses (WITH, LicenseRef-, free text)
    is not allowed.
    """
    tokens = _TOKEN.findall(expression)
    if "".join(tokens) != re.sub(r"\s+", "", expression):
        return False
    try:
        return _SpdxEvaluator(tokens, allowed).evaluate()
    except ValueError:
        return False


def check_override_citations(policy_text: str) -> list[str]:
    """Every override line must have a comment with an https:// URL directly above it."""
    errors: list[str] = []
    previous = ""
    for line in policy_text.splitlines():
        match = _OVERRIDE_LINE.match(line)
        if match and not (previous.lstrip().startswith("#") and "https://" in previous):
            errors.append(
                f"license-policy: override {match.group(1)} has no license file URL comment"
            )
        previous = line
    return errors


def python_packages() -> list[Package]:
    """Installed Python distributions, marked runtime when the engine/MCP/model-lab need them."""
    exported = run(
        "uv", "export", "--locked", "--no-dev", "--no-emit-workspace", "--no-hashes",
        "--no-header", "--no-annotate", "--format", "requirements-txt",
    )  # fmt: skip
    runtime = {
        normalize(line.split("==", 1)[0])
        for line in exported.splitlines()
        if "==" in line and not line.startswith("#")
    }
    packages = []
    for dist in importlib.metadata.distributions():
        name = normalize(dist.metadata["Name"])
        workspace_member = name.startswith("doppelganger-")
        packages.append(
            Package(
                ecosystem="python",
                name=name,
                version=dist.version,
                license=dist.metadata.get("License-Expression"),
                runtime=workspace_member or name in runtime,
            )
        )
    return packages


def npm_packages() -> list[Package]:
    """Installed npm packages from `pnpm licenses list`."""

    def listing(*extra: str) -> dict[tuple[str, str], str]:
        data: dict[str, list[dict[str, object]]] = json.loads(
            run("pnpm", "licenses", "list", "--json", *extra) or "{}"
        )
        found: dict[tuple[str, str], str] = {}
        for license_name, entries in data.items():
            for entry in entries:
                versions = entry.get("versions")
                for version in versions if isinstance(versions, list) else []:
                    found[(str(entry["name"]), str(version))] = license_name
        return found

    everything = listing()
    runtime = listing("--prod")
    return [
        Package(
            ecosystem="npm",
            name=name,
            version=version,
            license=None if license_name.lower() == "unknown" else license_name,
            runtime=(name, version) in runtime,
        )
        for (name, version), license_name in everything.items()
    ]


def main() -> int:
    """Check every package and report violations."""
    policy_text = POLICY_PATH.read_text(encoding="utf-8")
    policy = tomllib.loads(policy_text)
    base = frozenset(policy["allowed"])
    dev = base | frozenset(policy["dev_only"])
    overrides: dict[str, dict[str, str]] = {
        ecosystem: dict(policy.get(ecosystem, {}).get("overrides", {}))
        for ecosystem in ("python", "npm")
    }

    errors = check_override_citations(policy_text)
    used: set[tuple[str, str]] = set()
    packages = python_packages() + npm_packages()

    for package in sorted(packages, key=lambda p: (p.ecosystem, p.name, p.version)):
        key = f"{package.name}=={package.version}"
        expression = package.license
        if key in overrides[package.ecosystem]:
            expression = overrides[package.ecosystem][key]
            used.add((package.ecosystem, key))
        scope = "runtime" if package.runtime else "dev"
        if expression is None:
            errors.append(
                f"license-check: {package.ecosystem} {key} ({scope}): unknown license; "
                "add an override citing the license file"
            )
        elif not spdx_allowed(expression, base if package.runtime else dev):
            errors.append(
                f"license-check: {package.ecosystem} {key} ({scope}): '{expression}' is not allowed"
            )

    for ecosystem, entries in overrides.items():
        for key in entries:
            if (ecosystem, key) not in used:
                sys.stderr.write(f"license-check: warning: unused {ecosystem} override {key}\n")

    for error in errors:
        sys.stderr.write(error + "\n")
    runtime_count = sum(p.runtime for p in packages)
    status = "FAILED" if errors else "ok"
    sys.stdout.write(
        f"license-check: {status}, {len(packages)} packages "
        f"({runtime_count} runtime), {len(errors)} violation(s)\n"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
