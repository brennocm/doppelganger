# ruff: noqa: INP001  (standalone script, not part of a package)
"""Hook prompt-logger (kiro-workbench Requirement 3.3).

On UserPromptSubmit, append the submitted prompt to docs/prompt-history.md as the next
numbered entry, after redacting secrets (gitleaks) and personal data (pii_scan).

Rules:
- Redaction runs before anything is written. The redacted text is scanned again; if any
  step fails or anything is still found, nothing is written and a warning is printed.
  The raw prompt is never written anywhere.
- The surface (CLI or IDE) is not identified reliably by the hook event or environment,
  so it is written as "set by hand", like the spec field.
- An entry identical to the last one is not written twice.
- Warnings go to stdout with exit code 0: in the IDE a non-zero exit would block the
  user's prompt, and a logging problem must never do that.
"""

from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

# pii_scan and token_shapes live one folder up, in scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pii_scan
import token_shapes

HISTORY = Path("docs/prompt-history.md")
UNKNOWN = "set by hand"
_ENTRY = re.compile(r"^## (\d{3}) — ", re.MULTILINE)

SecretScanner = Callable[[str], list[str]]


class RedactionError(Exception):
    """Redaction could not be completed safely."""


def gitleaks_secrets(text: str) -> list[str]:
    """Return the secret strings gitleaks finds in text, scanning in memory."""
    mise = shutil.which("mise")
    if mise is None:
        msg = "mise not found on PATH"
        raise RedactionError(msg)
    # Fixed argument list; the prompt goes through stdin, never the command line.
    result = subprocess.run(  # noqa: S603
        [
            mise, "x", "--", "gitleaks", "stdin", "--no-banner", "--log-level", "error",
            "--report-format", "json", "--report-path", "-", "--exit-code", "0",
        ],
        input=text,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )  # fmt: skip
    if result.returncode != 0:
        msg = f"gitleaks exited with {result.returncode}"
        raise RedactionError(msg)
    try:
        findings = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as error:
        msg = "gitleaks report is not JSON"
        raise RedactionError(msg) from error
    return [f["Secret"] for f in findings if isinstance(f, dict) and f.get("Secret")]


def redact(prompt: str, scan_secrets: SecretScanner) -> str:
    """Redact secrets, token shapes and personal data, then verify nothing is left."""
    text = prompt
    for secret in sorted(set(scan_secrets(text)), key=len, reverse=True):
        text = text.replace(secret, "<redacted-secret>")
    text = token_shapes.redact(text)
    text = pii_scan.redact(text)
    if scan_secrets(text) or token_shapes.find(text) or pii_scan.find(text):
        msg = "redacted text still contains a secret or personal data"
        raise RedactionError(msg)
    return text


def _fence(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def _last_entry_body(history: str) -> str | None:
    matches = list(_ENTRY.finditer(history))
    if not matches:
        return None
    tail = history[matches[-1].start() :]
    body = re.search(r"\n(`{3,})text\n(.*?)\n\1\n", tail, re.DOTALL)
    return body.group(2) if body else None


def format_entry(number: int, today: dt.date, prompt: str) -> str:
    """Render one entry in the format at the top of the prompt history."""
    fence = _fence(prompt)
    return (
        f"\n## {number:03d} — {today.isoformat()} — {UNKNOWN} — {UNKNOWN}\n\n"
        f"{fence}text\n{prompt}\n{fence}\n\nOutcome: _pending_\n"
    )


def log_prompt(history_path: Path, prompt: str, today: dt.date, scan_secrets: SecretScanner) -> str:
    """Append the redacted prompt; return a status line. Never writes on failure."""
    if not prompt.strip():
        return "prompt-logger: empty prompt, nothing written"
    try:
        safe = redact(prompt, scan_secrets)
    except (RedactionError, OSError, subprocess.SubprocessError) as error:
        return f"prompt-logger: WARNING redaction failed ({error}); nothing written"
    with history_path.open("r+", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        history = handle.read()
        if _last_entry_body(history) == safe:
            return "prompt-logger: same as the last entry, nothing written"
        numbers = [int(n) for n in _ENTRY.findall(history)]
        number = max(numbers, default=0) + 1
        handle.seek(0, os.SEEK_END)
        handle.write(format_entry(number, today, safe))
    changed = " (redacted)" if safe != prompt else ""
    return f"prompt-logger: logged entry {number:03d}{changed}"


def _prompt_from_event() -> str:
    raw = "" if sys.stdin.isatty() else sys.stdin.read()
    try:
        event = json.loads(raw or "{}")
    except json.JSONDecodeError:
        event = {}
    prompt = event.get("prompt") if isinstance(event, dict) else None
    return prompt if isinstance(prompt, str) else os.environ.get("USER_PROMPT", "")


def main() -> int:
    """Entry point for the UserPromptSubmit hook."""
    try:
        root = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        status = log_prompt(
            Path(root) / HISTORY, _prompt_from_event(), dt.datetime.now().astimezone().date(),
            gitleaks_secrets,
        )  # fmt: skip
    except Exception as error:  # noqa: BLE001  (a logging failure must never block the prompt)
        status = f"prompt-logger: WARNING {type(error).__name__}; nothing written"
    sys.stdout.write(status + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
