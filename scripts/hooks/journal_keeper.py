# ruff: noqa: INP001  (standalone script, not part of a package)
"""Hook journal-keeper (kiro-workbench Requirement 3.1).

  journal_keeper.py snapshot   on UserPromptSubmit: record the working tree at turn start
  journal_keeper.py check      on Stop: ask the agent for one journal entry if needed

`check` asks (prints a Stop "block" decision, which starts one more agent turn) only when:
- files other than docs/kiro-journal.md and docs/prompt-history.md changed during the turn,
- the journal itself was not changed during the turn, and
- it has not already asked since the last snapshot.

The last rule means the follow-up turn can never trigger a second request: no loop.
State lives under the git directory, so it is never committed.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

JOURNAL = "docs/kiro-journal.md"
EXEMPT = frozenset({JOURNAL, "docs/prompt-history.md"})
PROMPT = (
    "If files changed in this turn, append one entry to `docs/kiro-journal.md` using the "
    "template in the kiro-workflow steering. Be factual; include failures. "
    "Do not modify any other file."
)


def _git(repo: Path, *args: str) -> str:
    # Fixed git subcommands built in this file; no shell, no user input.
    return subprocess.run(  # noqa: S603
        ["git", *args],  # noqa: S607
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    ).stdout


def _head(repo: Path) -> str | None:
    try:
        return _git(repo, "rev-parse", "--verify", "-q", "HEAD").strip() or None
    except subprocess.CalledProcessError:
        return None


def _dirty(repo: Path) -> dict[str, str]:
    """Map every changed or untracked path to a hash of its current content."""
    out = _git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = [e for e in out.split("\0") if e]
    paths: list[str] = []
    skip = False
    for entry in entries:
        if skip:  # the source path of a rename
            skip = False
            continue
        status, path = entry[:2], entry[3:]
        paths.append(path)
        skip = "R" in status or "C" in status
    result = {}
    for path in paths:
        file = repo / path
        result[path] = (
            hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else "deleted"
        )
    return result


def state_file(repo: Path, session: str) -> Path:
    """Where the snapshot for one session is kept (inside the git directory)."""
    git_dir = Path(_git(repo, "rev-parse", "--absolute-git-dir").strip())
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in session) or "default"
    return git_dir / "kiro-hooks" / "journal-keeper" / f"{safe}.json"


def snapshot(repo: Path, session: str) -> None:
    """Record HEAD and the dirty files at the start of a turn."""
    path = state_file(repo, session)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"head": _head(repo), "dirty": _dirty(repo), "asked": False}))


def changed_files(repo: Path, state: dict[str, object]) -> set[str]:
    """Files whose content or commit status changed since the snapshot."""
    before = state.get("dirty")
    before = before if isinstance(before, dict) else {}
    now = _dirty(repo)
    changed = {p for p in set(before) | set(now) if before.get(p) != now.get(p)}
    old_head, new_head = state.get("head"), _head(repo)
    if isinstance(old_head, str) and new_head and old_head != new_head:
        changed |= set(_git(repo, "diff", "--name-only", old_head, new_head).split())
    return changed


def check(repo: Path, session: str) -> str | None:
    """Return the Stop decision JSON to print, or None when no entry is needed."""
    path = state_file(repo, session)
    if not path.is_file():
        return None
    state = json.loads(path.read_text())
    if state.get("asked"):
        return None
    changed = changed_files(repo, state)
    if JOURNAL in changed or not (changed - EXEMPT):
        return None
    state["asked"] = True
    path.write_text(json.dumps(state))
    return json.dumps({"decision": "block", "reason": PROMPT})


def _session_from_event() -> str:
    session = os.environ.get("KIRO_SESSION_ID", "")
    if not sys.stdin.isatty():
        try:
            event = json.loads(sys.stdin.read() or "{}")
        except json.JSONDecodeError:
            event = {}
        if isinstance(event, dict) and isinstance(event.get("session_id"), str):
            session = event["session_id"] or session
    return session or "default"


def main(argv: list[str]) -> int:
    """Entry point for the hook commands."""
    if len(argv) != 1 or argv[0] not in {"snapshot", "check"}:
        sys.stderr.write("usage: journal_keeper.py snapshot|check\n")
        return 2
    repo = Path(_git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    session = _session_from_event()
    if argv[0] == "snapshot":
        snapshot(repo, session)
        return 0
    decision = check(repo, session)
    if decision:
        sys.stdout.write(decision + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
