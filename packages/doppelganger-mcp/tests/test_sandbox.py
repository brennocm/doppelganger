"""Path sandbox (kiro-workbench Requirement 7.4)."""

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from doppelganger_mcp import sandbox


@pytest.fixture(scope="module")
def tree() -> Iterator[Path]:
    """root/ (allowed) and outside/, with symlinks across them in both directions."""
    with tempfile.TemporaryDirectory(prefix="mcp-sandbox-") as tmp:
        base = Path(tmp)
        root, outside = base / "root", base / "outside"
        (root / "sub").mkdir(parents=True)
        outside.mkdir()
        (root / "inside.wav").write_bytes(b"RIFF-in")
        (root / "sub" / "deep.wav").write_bytes(b"RIFF-deep")
        (root / "é音.wav").write_bytes(b"RIFF-unicode")
        (outside / "secret.wav").write_bytes(b"secret")
        (root / "link-out").symlink_to(outside / "secret.wav")
        (root / "dir-out").symlink_to(outside, target_is_directory=True)
        (outside / "link-in").symlink_to(root / "inside.wav")
        (root / "loop").symlink_to(root / "loop")
        os.mkfifo(root / "fifo")
        yield base


SEGMENTS = st.sampled_from(
    [
        "..",
        ".",
        "",
        "root",
        "outside",
        "sub",
        "inside.wav",
        "deep.wav",
        "é音.wav",
        "secret.wav",
        "link-out",
        "dir-out",
        "link-in",
        "loop",
        "fifo",
        "missing.wav",
    ]
)
PREFIXES = st.sampled_from(["base", "root", "outside", "relative", "absolute-system"])


def _expected(candidate: str, root: Path) -> bool:
    """Oracle: a regular file whose real path is inside the real root."""
    real = os.path.realpath(candidate)
    # os.path on purpose: an oracle independent of the pathlib code under test.
    return os.path.isfile(real) and Path(real).is_relative_to(root.resolve())  # noqa: PTH113


def _build(tree: Path, prefix: str, parts: list[str]) -> str:
    starts = {
        "base": str(tree),
        "root": str(tree / "root"),
        "outside": str(tree / "outside"),
        "relative": "",
        "absolute-system": "/etc",
    }
    # Plain string joining keeps "", "." and ".." exactly as a caller would send them.
    return os.path.join(starts[prefix], *parts) if parts or starts[prefix] else ""  # noqa: PTH118


# Feature: kiro-workbench, Property 1: Path sandbox
@settings(max_examples=200, deadline=None)
@given(prefix=PREFIXES, parts=st.lists(SEGMENTS, max_size=6), text=st.text(max_size=8))
def test_files_are_read_only_inside_the_allowlisted_roots(
    tree: Path, prefix: str, parts: list[str], text: str
) -> None:
    root = tree / "root"
    candidate = _build(tree, prefix, parts) + text
    reads: list[Path] = []

    def reader(path: Path) -> bytes:
        reads.append(path)
        return b"data"

    try:
        sandbox.read_allowed(candidate, [root], reader)
        accepted = True
    except sandbox.SandboxError:
        accepted = False
    if "\x00" in candidate or not candidate:
        assert not accepted
    else:
        assert accepted == _expected(candidate, root)
    assert len(reads) == (1 if accepted else 0)
    for path in reads:
        assert path.is_relative_to(root.resolve())
        assert not path.is_symlink()


def test_examples(tree: Path) -> None:
    root = tree / "root"
    assert sandbox.read_allowed(str(root / "sub" / ".." / "inside.wav"), [root]) == b"RIFF-in"
    assert sandbox.read_allowed(str(tree / "outside" / "link-in"), [root]) == b"RIFF-in"
    for refused in ["link-out", "dir-out/secret.wav", "loop", "fifo", "sub", "../outside"]:
        with pytest.raises(sandbox.SandboxError, match="outside the allowed folders"):
            sandbox.read_allowed(str(root / refused), [root])
    with pytest.raises(sandbox.SandboxError):
        sandbox.read_allowed("", [root])
    with pytest.raises(sandbox.SandboxError):
        sandbox.read_allowed(str(root / "inside.wav"), [tree / "does-not-exist"])


def test_files_over_the_limit_are_refused_before_reading(tmp_path: Path) -> None:
    big = tmp_path / "big.wav"
    with big.open("wb") as handle:
        handle.truncate(sandbox.MAX_BYTES + 1)  # sparse: no real 20 MB written
    calls: list[Path] = []
    with pytest.raises(sandbox.TooLargeError, match="20 MB"):
        sandbox.read_allowed(str(big), [tmp_path], lambda p: calls.append(p) or b"")
    assert calls == []


def test_roots_come_from_the_environment_or_default_to_the_replay_folder() -> None:
    assert sandbox.roots_from_env({}) == sandbox.DEFAULT_ROOTS
    assert sandbox.roots_from_env({sandbox.ROOTS_ENV: "/a:/b:"}) == (Path("/a"), Path("/b"))
    assert sandbox.DEFAULT_ROOTS[0].parts[-3:] == ("web", "public", "replay")
