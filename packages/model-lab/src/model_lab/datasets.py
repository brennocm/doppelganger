"""Evaluation datasets: the Haunt_Set and ASVspoof 2019 LA (Requirement 2.1).

Both live outside the repository. Items carry only paths relative to their dataset root;
reports never contain them (Requirement 2.4).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Final, Literal

from model_lab import codecs, haunt_set

if TYPE_CHECKING:
    from collections.abc import Callable

HAUNT_SET: Final = "haunt-set"
ASVSPOOF_2019_LA: Final = "asvspoof2019-la"
BENCHMARK_ENV: Final = "BENCHMARK_DIR"
_PROTOCOL: Final = "ASVspoof2019_LA_cm_protocols/ASVspoof2019.LA.cm.eval.trl.txt"
_PROTOCOL_FIELDS: Final = 5

Split = Literal["dev", "eval"]


@dataclass(frozen=True)
class Item:
    """One labelled audio file. label: 1 synthetic, 0 genuine."""

    dataset: str
    path: str
    label: int
    group: str
    system: str
    split: Split


def item_seed(item: Item) -> int:
    """Deterministic per-item seed for codec noise (Requirement 2.5)."""
    return int.from_bytes(hashlib.sha256(f"{item.dataset}:{item.path}".encode()).digest()[:4])


def haunt_set_items(rows: list[haunt_set.IndexRow], seed: int = 0) -> list[Item]:
    """Haunt_Set rows with their session-based split."""
    split = haunt_set.split_sessions(rows, seed=seed)
    return [
        Item(
            dataset=HAUNT_SET,
            path=row.path,
            label=1 if row.label == "synthetic" else 0,
            group=row.session_id,
            system=row.system_id or "genuine",
            split="dev" if row.session_id in split.dev else "eval",
        )
        for row in rows
    ]


def parse_asvspoof_protocol(lines: list[str]) -> list[Item]:
    """Parse the LA eval protocol: ``speaker utterance - system key``."""
    items: list[Item] = []
    for number, line in enumerate(lines, start=1):
        fields = line.split()
        if not fields:
            continue
        if len(fields) != _PROTOCOL_FIELDS or fields[4] not in ("bonafide", "spoof"):
            msg = f"ASVspoof protocol line {number} is malformed"
            raise haunt_set.DatasetError(msg)
        speaker, utterance, _, system, key = fields
        items.append(
            Item(
                dataset=ASVSPOOF_2019_LA,
                path=f"ASVspoof2019_LA_eval/flac/{utterance}.flac",
                label=1 if key == "spoof" else 0,
                group=speaker,
                system="genuine" if system == "-" else system,
                split="eval",
            )
        )
    return items


def asvspoof_root(root: Path) -> Path:
    """Accept either the LA folder or its parent."""
    return root / "LA" if (root / "LA" / _PROTOCOL).is_file() else root


def load_asvspoof(root: Path) -> list[Item]:
    """Read the LA eval protocol under $BENCHMARK_DIR."""
    protocol = asvspoof_root(root) / _PROTOCOL
    if not protocol.is_file():
        msg = f"{BENCHMARK_ENV} does not contain the ASVspoof 2019 LA eval protocol"
        raise haunt_set.DatasetError(msg)
    return parse_asvspoof_protocol(protocol.read_text(encoding="utf-8").splitlines())


def subsample(items: list[Item], limit: int | None, seed: int = 0) -> list[Item]:
    """Deterministic subset of at most limit items, keeping the input order."""
    if limit is None or len(items) <= limit:
        return items
    ranked = sorted(
        items, key=lambda i: hashlib.sha256(f"{seed}:{i.dataset}:{i.path}".encode()).digest()
    )
    keep = {(i.dataset, i.path) for i in ranked[:limit]}
    return [i for i in items if (i.dataset, i.path) in keep]


def file_source(roots: dict[str, Path]) -> Callable[[Item], codecs.Audio]:
    """Audio source reading files under each dataset root and decoding them in memory."""

    def load(item: Item) -> codecs.Audio:
        relative = PurePosixPath(item.path)
        if relative.is_absolute() or ".." in relative.parts:
            msg = "dataset item path must be relative"
            raise haunt_set.DatasetError(msg)
        return codecs.decode((roots[item.dataset] / relative).read_bytes())

    return load
