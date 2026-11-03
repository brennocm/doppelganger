"""Path sandbox (kiro-workbench Requirement 7.4)."""

import os
import stat
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


MAX_SYMLINKS = 40


def _absolute(candidate: str) -> str | None:
    """Expand a leading "~" like Path.expanduser and anchor relative paths at the cwd."""
    if candidate.startswith("~"):
        expanded = os.path.expanduser(candidate)  # noqa: PTH111  (os, not pathlib, on purpose)
        if expanded == candidate:  # pathlib raises here; the sandbox refuses
            return None
        candidate = expanded
    return candidate if candidate.startswith("/") else os.getcwd() + "/" + candidate  # noqa: PTH109


def _walk(candidate: str) -> str | None:
    """Strict POSIX realpath, written out by hand with os.lstat and os.readlink only.

    Models what Property 1 calls the "resolved real path": "" and "." are skipped; ".."
    pops the last resolved component lexically (so "inside.wav/.." is the root even though
    the kernel would refuse it); every other name must exist (os.lstat), and a symlink is
    replaced by its target's components (an absolute target restarts from "/"). Missing
    components, a walk through a file ("file/x") and more than 40 symlink expansions give
    None. A leading "~" is expanded like sandbox.allowed() does with Path.expanduser: an
    unknown user cannot be expanded and gives None. It never calls realpath or resolve.
    """
    start = _absolute(candidate)
    if start is None:
        return None
    todo = list(reversed(start.split("/")))
    resolved: list[str] = []
    expansions = 0
    while todo:
        name = todo.pop()
        if name in ("", "."):
            continue
        if name == "..":
            if resolved:
                resolved.pop()
            continue
        path = "/" + "/".join([*resolved, name])
        try:
            info = os.lstat(path)
        except (OSError, ValueError):
            return None
        if not stat.S_ISLNK(info.st_mode):
            resolved.append(name)
            continue
        expansions += 1
        if expansions > MAX_SYMLINKS:
            return None
        target = os.readlink(path)  # noqa: PTH115
        if target.startswith("/"):
            resolved = []
        todo.extend(reversed(target.split("/")))
    return "/" + "/".join(resolved)


def _expected(candidate: str, root: Path) -> bool:
    """Oracle for Property 1: the walked real path is a regular file inside the real root."""
    real = _walk(candidate)
    if real is None:
        return False
    try:
        is_regular = stat.S_ISREG(os.stat(real).st_mode)  # noqa: PTH116
    except OSError:
        return False
    return is_regular and Path(real).is_relative_to(root.resolve())


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


def test_the_walker_oracle_on_known_paths(tree: Path) -> None:
    real_root = str((tree / "root").resolve())
    real_outside = str((tree / "outside").resolve())
    assert _walk(f"{tree}/outside/link-in") == f"{real_root}/inside.wav"
    assert _walk(f"{tree}/root/dir-out/secret.wav") == f"{real_outside}/secret.wav"
    assert _walk(f"{tree}/root/inside.wav/../sub/./deep.wav") == f"{real_root}/sub/deep.wav"
    assert _walk(f"{tree}/root/loop") is None  # more than 40 expansions
    assert _walk(f"{tree}/root/inside.wav/x") is None  # through a file
    assert _walk(f"{tree}/root/missing.wav") is None
    assert _walk("~nosuchuser-doppelganger/x") is None


def test_a_path_through_a_file_is_refused(tree: Path) -> None:
    # Shrunk Hypothesis counterexample (2026-11-02): a non-strict realpath() collapses this to
    # deep.wav, but "deep.wav/root" does not exist, so strict resolution refuses it.
    candidate = str(tree / "root" / "sub" / "deep.wav" / "root" / "..")
    with pytest.raises(sandbox.SandboxError, match="outside the allowed folders"):
        sandbox.read_allowed(candidate, [tree / "root"])


def test_a_trailing_dot_after_a_file_reads_that_file(tree: Path) -> None:
    # Shrunk Hypothesis counterexample (seed 8, 2026-11-02): pathlib drops ".", so this is
    # inside.wav, a regular file inside the root.
    candidate = f"{tree / 'root' / 'inside.wav'}/."
    assert sandbox.read_allowed(candidate, [tree / "root"]) == b"RIFF-in"


def test_dot_dot_after_a_file_resolves_to_its_folder(tree: Path) -> None:
    # Shrunk Hypothesis counterexample (2026-11-02): the real path is root/inside.wav, a
    # regular file inside the root, so it may be read.
    candidate = f"{tree / 'root' / 'inside.wav'}/../inside.wav"
    assert sandbox.read_allowed(candidate, [tree / "root"]) == b"RIFF-in"


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


def test_a_symlink_swapped_in_after_the_check_is_not_followed(tmp_path: Path) -> None:
    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"RIFF")

    def swap_then_read(path: Path) -> bytes:
        clip.unlink()
        clip.symlink_to("/dev/zero")  # the race the check cannot see
        return sandbox._read_no_follow(path)  # noqa: SLF001

    with pytest.raises(sandbox.SandboxError, match="outside the allowed folders"):
        sandbox.read_allowed(str(clip), [tmp_path], swap_then_read)


def test_a_fifo_swapped_in_after_the_check_does_not_hang(tmp_path: Path) -> None:
    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"RIFF")

    def swap_then_read(path: Path) -> bytes:
        clip.unlink()
        os.mkfifo(clip)
        return sandbox._read_no_follow(path)  # noqa: SLF001

    with pytest.raises(sandbox.SandboxError, match="outside the allowed folders"):
        sandbox.read_allowed(str(clip), [tmp_path], swap_then_read)


def test_read_errors_do_not_leak_the_path(tmp_path: Path) -> None:
    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"RIFF")

    def denied(path: Path) -> bytes:
        raise PermissionError(13, "Permission denied", str(path))

    with pytest.raises(sandbox.SandboxError) as caught:
        sandbox.read_allowed(str(clip), [tmp_path], denied)
    assert str(tmp_path) not in str(caught.value)
    assert str(caught.value) == sandbox.REFUSED


def test_the_default_reader_returns_the_file(tmp_path: Path) -> None:
    clip = tmp_path / "clip.wav"
    clip.write_bytes(b"RIFF" * 1000)
    assert sandbox.read_allowed(str(clip), [tmp_path]) == b"RIFF" * 1000
