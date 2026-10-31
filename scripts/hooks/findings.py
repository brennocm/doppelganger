# ruff: noqa: INP001  (standalone script, not part of a package)
"""Turn_Report for command hooks (kiro-workbench Requirements 1.x, 2.1, 2.4-2.6).

In the Kiro CLI V3, output from PostFileSave command hooks never reaches the agent, so
those hooks add findings to a per-session state file instead, and the `hook-findings`
Stop hook delivers them once per turn.

  findings.py turn-start                     UserPromptSubmit: a new turn may deliver again
  findings.py deliver                        Stop: print one continue decision, then clear
  findings.py scan-secrets FILE              secret-sentinel: gitleaks + PII, masked
  findings.py record HOOK KEY KIND DETAIL    shell hooks: replace HOOK's findings for KEY
  findings.py clear HOOK KEY                 shell hooks: HOOK found nothing for KEY

The hook event (JSON) is read from STDIN for the session id. Secret and personal-data
values never leave memory unmasked: gitleaks reports through a pipe, and only the first
4 characters followed by "…" are stored or printed.
"""

from __future__ import annotations

import fcntl
import json
import os
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

# pii_scan and token_shapes live one folder up, in scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pii_scan
import token_shapes

CAP = 50
ELLIPSIS = "…"
INTRO = (
    "Hook findings from this turn (Turn_Report, kiro-workbench Requirement 2.6). "
    "Secret and personal-data values are masked. Fix each finding, or say why it is a "
    "false positive. Do not copy secret values into any file or message."
)


@dataclass(frozen=True)
class Finding:
    """One finding: never holds a raw secret or personal-data value."""

    hook: str
    kind: str
    file: str
    line: int | None
    detail: str


SecretScanner = Callable[[Path], list[tuple[int, str, str]]]  # (line, rule, raw value)


def mask(value: str) -> str:
    """First 4 characters followed by "…"; "…" alone for 4 characters or fewer."""
    return value[:4] + ELLIPSIS if len(value) > 4 else ELLIPSIS  # noqa: PLR2004


def state_file(repo: Path, session: str) -> Path:
    """Where one session's Turn_Report lives (inside the git directory, never committed)."""
    git_dir = Path(
        subprocess.run(
            ["git", "rev-parse", "--absolute-git-dir"],  # noqa: S607
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in session) or "default"
    return git_dir / "kiro-hooks" / "findings" / f"{safe}.json"


@contextmanager
def _locked_state(path: Path) -> Iterator[dict[str, Any]]:
    """Read, lock and write back the state; several hooks run at once for one save."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.seek(0)
        raw = handle.read()
        try:
            state = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            state = {}
        state.setdefault("delivered", False)
        state.setdefault("groups", {})
        yield state
        handle.seek(0)
        handle.truncate()
        handle.write(json.dumps(state, ensure_ascii=False))


def _stored_count(groups: dict[str, Any], skip: str | None = None) -> int:
    return sum(len(g["findings"]) for k, g in groups.items() if k != skip)


def replace(path: Path, hook: str, key: str, findings: list[Finding]) -> None:
    """Replace HOOK's findings for KEY, keeping the whole report at CAP findings or fewer."""
    group = f"{hook}\0{key}"
    with _locked_state(path) as state:
        groups = state["groups"]
        if not findings:
            groups.pop(group, None)
            return
        room = max(0, CAP - _stored_count(groups, skip=group))
        groups[group] = {"findings": [asdict(f) for f in findings[:room]], "total": len(findings)}


def turn_start(path: Path) -> None:
    """A new user turn: the report may be delivered once more."""
    with _locked_state(path) as state:
        state["delivered"] = False


def render(groups: dict[str, Any]) -> str:
    """The message the agent sees: one line per finding, then "…and N more"."""
    lines = [INTRO]
    omitted = 0
    for group in groups.values():
        omitted += group["total"] - len(group["findings"])
        for f in group["findings"]:
            where = f"{f['file']}:{f['line']}" if f["line"] is not None else f["file"]
            lines.append(f"- {f['hook']}: {f['kind']} in {where}: {f['detail']}")
    if omitted:
        lines.append(f"{ELLIPSIS}and {omitted} more")
    return "\n".join(lines)


def deliver(path: Path) -> str | None:
    """Return the Stop continue decision once per turn and clear the report, or None."""
    if not path.is_file():
        return None
    with _locked_state(path) as state:
        if state["delivered"] or not state["groups"]:
            return None
        message = render(state["groups"])
        state["groups"] = {}
        state["delivered"] = True
    return json.dumps({"decision": "block", "reason": message}, ensure_ascii=False)


def gitleaks_file(file: Path) -> list[tuple[int, str, str]]:
    """Secrets gitleaks finds in one file; the report goes through a pipe, never to disk."""
    mise = shutil.which("mise")
    if mise is None:
        msg = "mise not found on PATH"
        raise OSError(msg)
    # Fixed argument list; the file path is passed as one argument, no shell.
    result = subprocess.run(  # noqa: S603
        [
            mise, "x", "--", "gitleaks", "dir", "--no-banner", "--log-level", "error",
            "--report-format", "json", "--report-path", "-", "--exit-code", "0", str(file),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=45,
        cwd=Path(__file__).resolve().parents[2],  # the repo's mise config pins gitleaks
    )  # fmt: skip
    if result.returncode != 0:
        msg = f"gitleaks exited with {result.returncode}"
        raise OSError(msg)
    report = json.loads(result.stdout or "[]")
    return [
        (int(f.get("StartLine", 0)), str(f.get("RuleID", "secret")), str(f.get("Secret", "")))
        for f in report
        if isinstance(f, dict)
    ]


def scan_secrets(repo: Path, rel: str, scanner: SecretScanner) -> list[Finding]:
    """Masked findings for secrets and personal data in one file."""
    file = repo / rel
    try:
        text = file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        text = ""
    findings: list[Finding] = []
    seen: set[tuple[int, str]] = set()
    try:
        for line, rule, value in scanner(file):
            seen.add((line, value))
            findings.append(Finding("secret-sentinel", f"secret ({rule})", rel, line, mask(value)))
    except (OSError, ValueError, subprocess.SubprocessError):
        findings.append(
            Finding("secret-sentinel", "scan-error", rel, None, "gitleaks could not scan this file")
        )
    # Fixed token shapes, whatever their entropy; skip what gitleaks already reported.
    findings.extend(
        Finding("secret-sentinel", f"secret ({m.rule})", rel, m.line, mask(m.value))
        for m in token_shapes.find(text)
        if (m.line, m.value) not in seen
    )
    findings.extend(
        Finding("secret-sentinel", f.kind, rel, f.line, mask(f.value)) for f in pii_scan.find(text)
    )
    return findings


def _session_from_event(raw: str) -> str:
    session = os.environ.get("KIRO_SESSION_ID", "")
    try:
        event = json.loads(raw or "{}")
    except json.JSONDecodeError:
        event = {}
    if isinstance(event, dict) and isinstance(event.get("session_id"), str):
        session = event["session_id"] or session
    return session or "default"


def main(argv: list[str]) -> int:
    """Entry point for the hook commands. Always exits 0: findings go to the Turn_Report."""
    raw = "" if sys.stdin.isatty() else sys.stdin.read()
    repo = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    path = state_file(repo, _session_from_event(raw))
    match argv:
        case ["turn-start"]:
            turn_start(path)
        case ["deliver"]:
            decision = deliver(path)
            if decision:
                sys.stdout.write(decision + "\n")
        case ["scan-secrets", rel]:
            found = scan_secrets(repo, rel, gitleaks_file)
            replace(path, "secret-sentinel", rel, found)
            status = f"{len(found)} finding(s), added to the Turn_Report" if found else "clean"
            sys.stdout.write(f"secret-sentinel: {rel} {status}\n")
        case ["record", hook, key, kind, detail]:
            replace(path, hook, key, [Finding(hook, kind, key, None, detail)])
        case ["clear", hook, key]:
            replace(path, hook, key, [])
        case _:
            sys.stderr.write(__doc__ or "")
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
