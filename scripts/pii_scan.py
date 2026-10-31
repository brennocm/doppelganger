# ruff: noqa: INP001  (standalone script, not part of a package)
"""Find and redact personal data: e-mail addresses, local home paths and IPv4 addresses.

Used by the secret-sentinel hook (report) and the prompt-logger hook (redact).
Documented placeholders are ignored:

- e-mail addresses at example.com and example.org (and their subdomains)
- 127.0.0.1, 0.0.0.0 and the RFC 5737 documentation ranges
  192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24
- home paths whose user part is a placeholder: <user>, <anything>, $USER, ${USER},
  user, username

Usage: python scripts/pii_scan.py FILE...   (prints path:line: kind: value; exit 1 on findings)
"""

from __future__ import annotations

import ipaddress
import re
import sys
from dataclasses import dataclass
from pathlib import Path

_EMAIL = re.compile(r"(?<![\w.%+-])[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b")
# The user part must look like a user name (or a <placeholder>), so text that quotes a
# path pattern, such as this file's own regular expression, is not reported.
_HOME = re.compile(r"(?:/home/|/Users/|[A-Za-z]:\\Users\\)(<[^>\s]*>|[A-Za-z0-9_][A-Za-z0-9._-]*)")
_IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\.?\d)")

_PLACEHOLDER_DOMAINS = ("example.com", "example.org")
_PLACEHOLDER_USERS = {"$user", "${user}", "user", "username"}
_ALLOWED_IPS = {ipaddress.IPv4Address("127.0.0.1"), ipaddress.IPv4Address("0.0.0.0")}  # noqa: S104
_DOC_NETS = tuple(
    ipaddress.IPv4Network(net) for net in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)

REPLACEMENTS = {
    "email": "user@example.com",
    "home-path": "/home/<user>",
    "ipv4": "192.0.2.1",
}


@dataclass(frozen=True)
class Finding:
    """One piece of personal data in a text."""

    line: int
    kind: str
    start: int
    end: int
    value: str


def _is_placeholder_email(domain: str) -> bool:
    domain = domain.lower()
    return any(domain == d or domain.endswith("." + d) for d in _PLACEHOLDER_DOMAINS)


def _is_placeholder_user(user: str) -> bool:
    return (user.startswith("<") and user.endswith(">")) or user.lower() in _PLACEHOLDER_USERS


def _is_placeholder_ip(text: str) -> bool | None:
    """Return True for placeholders, False for real addresses, None when not an IPv4 address."""
    try:
        address = ipaddress.IPv4Address(text)
    except ValueError:
        return None
    return address in _ALLOWED_IPS or any(address in net for net in _DOC_NETS)


def _spans(text: str) -> list[tuple[str, int, int]]:
    spans: list[tuple[str, int, int]] = []
    spans.extend(
        ("email", m.start(), m.end())
        for m in _EMAIL.finditer(text)
        if not _is_placeholder_email(m.group(1))
    )
    spans.extend(
        ("home-path", m.start(), m.end())
        for m in _HOME.finditer(text)
        if not _is_placeholder_user(m.group(1))
    )
    spans.extend(
        ("ipv4", m.start(), m.end())
        for m in _IPV4.finditer(text)
        if _is_placeholder_ip(m.group(0)) is False
    )
    return sorted(spans, key=lambda s: s[1])


def find(text: str) -> list[Finding]:
    """Return every non-placeholder e-mail, home path and IPv4 address, in order."""
    findings = []
    for kind, start, end in _spans(text):
        line = text.count("\n", 0, start) + 1
        findings.append(Finding(line, kind, start, end, text[start:end]))
    return findings


def redact(text: str) -> str:
    """Replace every finding with its placeholder."""
    out: list[str] = []
    cursor = 0
    for kind, start, end in _spans(text):
        if start < cursor:  # overlapping match, already replaced
            continue
        out.append(text[cursor:start])
        out.append(REPLACEMENTS[kind])
        cursor = end
    out.append(text[cursor:])
    return "".join(out)


def main(paths: list[str]) -> int:
    """Scan files and print findings as path:line: kind: value."""
    found = 0
    for name in paths:
        path = Path(name)
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for finding in find(text):
            sys.stderr.write(f"{name}:{finding.line}: {finding.kind}: {finding.value}\n")
            found += 1
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
