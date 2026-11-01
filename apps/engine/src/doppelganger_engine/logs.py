"""Structured JSON logs to stdout (Requirement 1.4).

Only fixed event names and whitelisted fields are written: never audio, tokens or file
names supplied by the user. The launch URL with the token is printed separately, once.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Final, TextIO

ALLOWED_FIELDS: Final = frozenset(
    {"modelId", "port", "status", "windows", "bytes", "code", "reason", "durationS", "level"}
)


class JsonLog:
    """Writes one JSON object per line; unknown fields are dropped, not logged."""

    def __init__(self, level: str = "info", stream: TextIO | None = None) -> None:
        """Create a logger at the given level."""
        order = ["debug", "info", "warning", "error"]
        self._min = order.index(level)
        self._order = order
        self._stream = stream if stream is not None else sys.stdout

    def event(self, name: str, level: str = "info", **fields: object) -> None:
        """Log one event with only the allowed fields."""
        if self._order.index(level) < self._min:
            return
        record: dict[str, object] = {"ts": round(time.time(), 3), "level": level, "event": name}
        record.update({k: v for k, v in fields.items() if k in ALLOWED_FIELDS})
        self._stream.write(json.dumps(record, separators=(",", ":")) + "\n")
        self._stream.flush()
