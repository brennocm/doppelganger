"""Origin, token, rate-limit and size guards (local-runtime Requirements 2 and 4)."""

from __future__ import annotations

import hmac
import secrets
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

MAX_UPLOAD_BYTES: Final = 20 * 1024 * 1024
FAILURES_PER_MINUTE: Final = 10


def new_token() -> str:
    """A Session_Token from 32 random bytes (43 URL-safe characters)."""
    return secrets.token_urlsafe(32)


def origin_ok(origin: str | None, allowed: str) -> bool:
    """Exact string match; a missing Origin is rejected (Property 1)."""
    return origin is not None and origin == allowed


def token_ok(candidate: object, token: str) -> bool:
    """Constant-time comparison with the session token (Property 2)."""
    if not isinstance(candidate, str):
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), token.encode("utf-8"))


def bearer(header: str | None) -> str | None:
    """The token of an `Authorization: Bearer <token>` header."""
    if header is None or not header.startswith("Bearer "):
        return None
    return header[len("Bearer ") :]


@dataclass
class FailureLimiter:
    """Token bucket per client: 10 failures per minute, then requests get 429."""

    clock: Callable[[], float] = time.monotonic
    capacity: int = FAILURES_PER_MINUTE
    _buckets: dict[str, tuple[float, float]] = field(default_factory=dict)

    def _level(self, client: str) -> float:
        now = self.clock()
        tokens, at = self._buckets.get(client, (float(self.capacity), now))
        tokens = min(float(self.capacity), tokens + (now - at) * self.capacity / 60.0)
        self._buckets[client] = (tokens, now)
        return tokens

    def blocked(self, client: str) -> bool:
        """True when the client has used up its failures for now."""
        return self._level(client) < 1.0

    def fail(self, client: str) -> None:
        """Record one failed check."""
        tokens = self._level(client)
        self._buckets[client] = (max(0.0, tokens - 1.0), self.clock())


class TooLargeError(ValueError):
    """The request body is over the limit."""


def declared_too_large(content_length: str | None, limit: int = MAX_UPLOAD_BYTES) -> bool:
    """True when Content-Length says the body is over the limit (or is not a number)."""
    if content_length is None:
        return False
    try:
        value = int(content_length)
    except ValueError:
        return True
    return value < 0 or value > limit


async def read_limited(chunks: AsyncIterator[bytes], limit: int = MAX_UPLOAD_BYTES) -> bytes:
    """Read a streamed body into memory; stop as soon as it passes the limit (Property 3)."""
    body = bytearray()
    async for chunk in chunks:
        if len(body) + len(chunk) > limit:
            raise TooLargeError
        body.extend(chunk)
    return bytes(body)
