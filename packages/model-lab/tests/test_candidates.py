"""Candidate loaders (detection-model task 4.1, design P31).

Nothing here downloads: `fetch` always gets an injected `get`. Tests that need the real
checkpoints skip when they are not in the cache (CI has none).
"""

import hashlib
import urllib.request
from pathlib import Path

import pytest
import torch

from model_lab import candidates

WINDOW = candidates.WINDOW


def _cached(name: str) -> Path | None:
    entry = candidates.CATALOG["candidates"][name]
    path = candidates.cache_dir() / "checkpoints" / Path(entry["url"]).name
    return path if path.is_file() else None


needs_checkpoints = pytest.mark.skipif(
    any(_cached(n) is None for n in candidates.NAMES),
    reason="real checkpoints not in $DOPPELGANGER_CACHE/checkpoints (never downloaded in tests)",
)


def _no_network(url: str, _limit: int) -> bytes:
    msg = f"test tried to download {url}"
    raise AssertionError(msg)


def test_catalog_pins_every_candidate_over_https() -> None:
    assert set(candidates.NAMES) == {"aasist-l", "aasist"}
    for name in candidates.NAMES:
        entry = candidates.CATALOG["candidates"][name]
        assert entry["url"].startswith("https://")
        assert candidates.CATALOG["upstream"]["commit"] in entry["url"]
        assert len(entry["sha256"]) == 64  # noqa: PLR2004
        assert entry["license"]["weights"] == "MIT"


def test_verify_rejects_a_missing_file_and_a_wrong_size(tmp_path: Path) -> None:
    with pytest.raises(candidates.CheckpointError, match="missing or wrong size"):
        candidates.verify(tmp_path / "absent.pth", "aasist-l")
    short = tmp_path / "short.pth"
    short.write_bytes(b"\0" * 10)
    with pytest.raises(candidates.CheckpointError, match="missing or wrong size"):
        candidates.verify(short, "aasist-l")


def test_verify_rejects_a_wrong_hash_of_the_right_size(tmp_path: Path) -> None:
    size = candidates.CATALOG["candidates"]["aasist-l"]["bytes"]
    fake = tmp_path / "fake.pth"
    fake.write_bytes(b"\0" * size)
    with pytest.raises(candidates.CheckpointError, match="SHA-256"):
        candidates.verify(fake, "aasist-l")


def test_unknown_candidates_are_refused(tmp_path: Path) -> None:
    with pytest.raises(candidates.CheckpointError, match="unknown candidate"):
        candidates.verify(tmp_path / "x.pth", "wav2vec-big")


@pytest.mark.parametrize("payload", [b"", b"\0" * 10, b"\0" * 426_428])
def test_fetch_refuses_a_mismatched_download_and_keeps_nothing(
    tmp_path: Path, payload: bytes
) -> None:
    calls: list[tuple[str, int]] = []

    def get(url: str, limit: int) -> bytes:
        calls.append((url, limit))
        return payload

    with pytest.raises(candidates.CheckpointError, match="nothing kept"):
        candidates.fetch("aasist-l", root=tmp_path, get=get)
    entry = candidates.CATALOG["candidates"]["aasist-l"]
    assert calls == [(entry["url"], entry["bytes"])]
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []


@pytest.mark.parametrize(
    "url", ["http://example.com/AASIST-L.pth", "file:///etc/passwd", "ftp://example.com/x"]
)
def test_downloads_are_https_only(url: str) -> None:
    with pytest.raises(candidates.CheckpointError, match="HTTPS only"):
        candidates._https_get(url, 10)  # noqa: SLF001


@pytest.mark.parametrize("target", ["http://example.com/x.pth", "file:///etc/passwd"])
def test_redirects_away_from_https_are_refused(target: str) -> None:
    handler = candidates._HttpsOnlyRedirects()  # noqa: SLF001
    request = urllib.request.Request("https://example.com/x.pth")
    with pytest.raises(candidates.CheckpointError, match="away from HTTPS"):
        handler.redirect_request(request, None, 302, "Found", {}, target)


def test_a_cache_inside_the_repository_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOPPELGANGER_CACHE", str(candidates.REPO_ROOT / "packages" / "cache"))
    with pytest.raises(candidates.CheckpointError, match="outside the repository"):
        candidates.cache_dir()


def test_cache_dir_follows_the_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOPPELGANGER_CACHE", str(tmp_path))
    assert candidates.cache_dir() == tmp_path
    monkeypatch.delenv("DOPPELGANGER_CACHE")
    assert candidates.cache_dir() == Path.home() / ".cache" / "doppelganger"


def test_vendored_upstream_code_matches_its_recorded_hash() -> None:
    assert candidates.upstream_code_ok()


@pytest.mark.parametrize("name", candidates.NAMES)
def test_logits_only_returns_two_logits_per_window(name: str) -> None:
    torch.manual_seed(0)
    module = candidates.LogitsOnly(candidates.build(name)).eval()
    with torch.no_grad():
        out = module(torch.zeros(2, WINDOW))
    assert tuple(out.shape) == (2, 2)
    assert torch.isfinite(out).all()


def test_spec_is_fp32_two_class_with_spoof_at_index_zero() -> None:
    spec = candidates.spec("aasist-l")
    assert spec.output_kind == "two-class-logits"
    assert spec.spoof_index == 0
    assert spec.window_samples == WINDOW
    assert spec.hop_samples == candidates.HOP
    assert candidates.CATALOG["upstream"]["commit"] in spec.source


@needs_checkpoints
@pytest.mark.parametrize("name", candidates.NAMES)
def test_cached_checkpoint_is_reused_without_downloading(name: str) -> None:
    path = candidates.fetch(name, get=_no_network)
    candidates.verify(path, name)


@needs_checkpoints
@pytest.mark.parametrize("name", candidates.NAMES)
def test_fetch_keeps_a_matching_download(name: str, tmp_path: Path) -> None:
    cached = _cached(name)
    assert cached is not None
    data = cached.read_bytes()
    path = candidates.fetch(name, root=tmp_path, get=lambda _url, _limit: data)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == candidates.sha256_file(cached)
    assert [p.name for p in path.parent.iterdir()] == [path.name]


@needs_checkpoints
@pytest.mark.parametrize("name", candidates.NAMES)
def test_load_is_strict_and_has_the_recorded_parameter_count(name: str) -> None:
    cached = _cached(name)
    assert cached is not None
    model = candidates.load(name, cached)
    count = sum(p.numel() for p in model.parameters())
    assert count == candidates.CATALOG["candidates"][name]["parameters"]
    assert not model.training
