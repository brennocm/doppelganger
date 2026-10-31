# ruff: noqa: INP001  (standalone script, not part of a package)
"""Fixed token-shape rules, matched regardless of entropy.

gitleaks skips low-entropy strings, so a token-shaped value such as a fake or example
token can pass its default rules. These shapes are matched on their form alone. The same
regular expressions are custom rules in `.gitleaks.toml`; a test keeps the two in sync.

Used by the prompt-logger hook (redact) and secret-sentinel (report).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# rule id -> regular expression (gitleaks uses Go RE2 syntax; these are valid in both)
SHAPES: dict[str, str] = {
    "token-shape-github-classic": r"\b(?:ghp|gho)_[A-Za-z0-9]{36}\b",
    "token-shape-github-fine-grained": r"\bgithub_pat_[A-Za-z0-9_]{22,255}\b",
    "token-shape-huggingface": r"\bhf_[A-Za-z0-9]{30,40}\b",
    "token-shape-sk": r"\bsk-[A-Za-z0-9_-]{20,}",
    "token-shape-aws-access-key": r"\bAKIA[A-Z0-9]{16}\b",
    "token-shape-slack": r"\bxox[bp]-[A-Za-z0-9-]{10,}",
}
PLACEHOLDER = "<redacted-secret>"

_COMPILED = {rule: re.compile(pattern) for rule, pattern in SHAPES.items()}


@dataclass(frozen=True)
class Match:
    """One token-shaped value in a text."""

    rule: str
    line: int
    value: str


def find(text: str) -> list[Match]:
    """Every token-shaped value, in order of position."""
    hits = [
        (m.start(), Match(rule, text.count("\n", 0, m.start()) + 1, m.group(0)))
        for rule, pattern in _COMPILED.items()
        for m in pattern.finditer(text)
    ]
    return [match for _, match in sorted(hits, key=lambda h: h[0])]


def redact(text: str) -> str:
    """Replace every token-shaped value with the placeholder."""
    for pattern in _COMPILED.values():
        text = pattern.sub(PLACEHOLDER, text)
    return text
