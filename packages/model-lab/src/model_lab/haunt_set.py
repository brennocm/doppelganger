"""Haunt_Set index loading and session-based dev/eval splitting (detection-model 2.4).

The Haunt_Set lives outside the repository in $HAUNT_SET_DIR (see HAUNT_SET.md). Rows are
split by recording session, never by window, so a session and its clones always land on
the same side and nothing leaks from calibration into the reported numbers.
"""

from __future__ import annotations

import csv
import hashlib
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final, Literal

ENV_VAR: Final = "HAUNT_SET_DIR"
COLUMNS: Final = ("path", "label", "session_id", "system_id", "device", "room", "language")
DEFAULT_DEV_FRACTION: Final = 1 / 3

Label = Literal["genuine", "synthetic"]


class DatasetError(ValueError):
    """The dataset location or index is missing or malformed."""


@dataclass(frozen=True)
class IndexRow:
    """One audio file of the Haunt_Set; path is relative to the dataset root."""

    path: str
    label: Label
    session_id: str
    system_id: str
    language: str
    script_id: str


@dataclass(frozen=True)
class Split:
    """Sessions used for calibration and threshold tuning (dev) and for reporting (eval)."""

    dev: frozenset[str]
    eval: frozenset[str]


def dataset_dir(env_var: str = ENV_VAR) -> Path:
    """Return the dataset root from its environment variable, or fail naming it."""
    value = os.environ.get(env_var, "")
    if not value:
        msg = f"{env_var} is not set; export it to the dataset folder outside the repository"
        raise DatasetError(msg)
    root = Path(value)
    if not root.is_dir():
        msg = f"{env_var} does not point to a folder"
        raise DatasetError(msg)
    return root


def _relative(path: str, line: int) -> str:
    pure = PurePosixPath(path)
    if not path or pure.is_absolute() or ".." in pure.parts or "\\" in path:
        msg = f"index.csv line {line}: path must be relative to the dataset root"
        raise DatasetError(msg)
    return path


def parse_index(lines: list[str]) -> list[IndexRow]:
    """Parse index.csv content; errors name the line, never the file's absolute path."""
    reader = csv.DictReader(lines)
    missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        msg = f"index.csv is missing columns: {', '.join(missing)}"
        raise DatasetError(msg)
    rows: list[IndexRow] = []
    for line, record in enumerate(reader, start=2):
        label = record["label"]
        if label not in ("genuine", "synthetic"):
            msg = f"index.csv line {line}: label must be genuine or synthetic"
            raise DatasetError(msg)
        session = record["session_id"].strip()
        system = record["system_id"].strip()
        if not session:
            msg = f"index.csv line {line}: session_id is empty"
            raise DatasetError(msg)
        if (label == "synthetic") != bool(system):
            msg = f"index.csv line {line}: system_id is required for synthetic rows only"
            raise DatasetError(msg)
        rows.append(
            IndexRow(
                path=_relative(record["path"].strip(), line),
                label="genuine" if label == "genuine" else "synthetic",
                session_id=session,
                system_id=system,
                language=record["language"].strip(),
                script_id=(record.get("script_id") or "").strip(),
            )
        )
    return rows


def load_index(root: Path) -> list[IndexRow]:
    """Read root/index.csv."""
    index = root / "index.csv"
    if not index.is_file():
        msg = "index.csv not found in the dataset folder"
        raise DatasetError(msg)
    return parse_index(index.read_text(encoding="utf-8").splitlines())


def _order(session: str, seed: int) -> str:
    return hashlib.sha256(f"{seed}:{session}".encode()).hexdigest()


def split_sessions(
    rows: list[IndexRow], dev_fraction: float = DEFAULT_DEV_FRACTION, seed: int = 0
) -> Split:
    """Split sessions into dev and eval, stratified by language and deterministic.

    Per language, round(dev_fraction * n) sessions go to dev (at least one when the
    language has two or more sessions); the order comes from a seeded hash. When there
    are two or more sessions in total, both sides are non-empty.
    """
    if not 0.0 < dev_fraction < 1.0:
        msg = "dev_fraction must be between 0 and 1"
        raise ValueError(msg)
    languages: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        languages[row.session_id][row.language] += 1
    by_language: dict[str, list[str]] = defaultdict(list)
    for session, counts in languages.items():
        language = max(sorted(counts), key=lambda name: counts[name])
        by_language[language].append(session)
    dev: set[str] = set()
    for sessions in by_language.values():
        ordered = sorted(sessions, key=lambda s: _order(s, seed))
        take = round(dev_fraction * len(ordered))
        if len(ordered) >= 2:  # noqa: PLR2004  (a language needs two sessions to split)
            take = min(max(take, 1), len(ordered) - 1)
        dev.update(ordered[:take])
    every = set(languages)
    if len(every) >= 2:  # noqa: PLR2004
        if not dev:
            dev.add(min(every, key=lambda s: _order(s, seed)))
        if dev == every:
            dev.discard(max(every, key=lambda s: _order(s, seed)))
    return Split(dev=frozenset(dev), eval=frozenset(every - dev))


def rows_in(rows: list[IndexRow], sessions: frozenset[str]) -> list[IndexRow]:
    """Rows whose session is in sessions, in index order."""
    return [row for row in rows if row.session_id in sessions]
