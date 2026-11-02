"""Path allowlist for `analyze_audio_file` (kiro-workbench Requirement 7.4, Property 1).

A path is read only if, after following every symlink, it is a regular file inside one of
the allowlisted roots and no larger than the engine's upload limit. Every refusal has the
same message and happens before the file is opened.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

ROOTS_ENV: Final = "DOPPELGANGER_MCP_ROOTS"
#: packages/doppelganger-mcp/src/doppelganger_mcp/sandbox.py -> the repository root.
REPO_ROOT: Final = Path(__file__).resolve().parents[4]
DEFAULT_ROOTS: Final = (REPO_ROOT / "apps" / "web" / "public" / "replay",)
#: Same limit as the engine's Autopsy upload (security steering).
MAX_BYTES: Final = 20 * 1024 * 1024
REFUSED: Final = "path is outside the allowed folders, missing, or not a regular file"


class SandboxError(PermissionError):
    """The path may not be read."""


class TooLargeError(SandboxError):
    """The file is over the size limit."""


def roots_from_env(environ: dict[str, str] | None = None) -> tuple[Path, ...]:
    """Allowlisted roots: `DOPPELGANGER_MCP_ROOTS` (`:`-separated) or the replay folder."""
    raw = (environ if environ is not None else dict(os.environ)).get(ROOTS_ENV, "")
    parts = [p for p in raw.split(os.pathsep) if p.strip()]
    return tuple(Path(p) for p in parts) if parts else DEFAULT_ROOTS


def _resolved_roots(roots: Sequence[Path]) -> list[Path]:
    out = []
    for root in roots:
        try:
            out.append(root.resolve(strict=True))
        except OSError:
            continue  # a missing root allows nothing
    return out


def allowed(path: str, roots: Sequence[Path]) -> Path:
    """The resolved real path if it may be read; raise SandboxError otherwise. Never reads."""
    if not path or "\x00" in path:
        raise SandboxError(REFUSED)
    try:
        real = Path(path).expanduser().resolve(strict=True)
        info = real.stat()
    except (OSError, RuntimeError, ValueError):  # missing, loops, bad names
        raise SandboxError(REFUSED) from None
    if not stat.S_ISREG(info.st_mode):
        raise SandboxError(REFUSED)
    if not any(real.is_relative_to(root) for root in _resolved_roots(roots)):
        raise SandboxError(REFUSED)
    if info.st_size > MAX_BYTES:
        msg = f"file is larger than {MAX_BYTES // (1024 * 1024)} MB"
        raise TooLargeError(msg)
    return real


def read_allowed(
    path: str,
    roots: Sequence[Path],
    reader: Callable[[Path], bytes] = Path.read_bytes,
) -> bytes:
    """Read an allowed file into memory; the reader is never called for a refused path."""
    real = allowed(path, roots)
    data = reader(real)
    if len(data) > MAX_BYTES:  # the file grew after the check
        msg = f"file is larger than {MAX_BYTES // (1024 * 1024)} MB"
        raise TooLargeError(msg)
    return data
