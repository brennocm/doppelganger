import datetime as dt
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from model_lab import export, inference, manifest, windows

TODAY = dt.date(2026, 10, 31)
SMALL = 256


def _small_export(tmp_path: Path, *, auc: bool = True) -> export.ExportResult:
    spec = export.synthetic_spec(window=SMALL, hop=64)
    fixtures = export.fixture_windows(200, SMALL, seed=1)
    check = export.agreement_auc_check(fixtures, "two-class-logits", 1) if auc else None
    return export.export_model(export.synthetic_model(SMALL), spec, tmp_path, check, TODAY)


def test_export_writes_a_verified_int8_model_and_manifest(tmp_path: Path) -> None:
    result = _small_export(tmp_path)
    assert result.max_abs_diff <= export.PARITY_TOLERANCE
    assert result.int8_auc is not None
    assert result.manifest.quantization.value == "int8"
    assert result.manifest.role.value == "test"
    assert result.manifest.windowSamples == SMALL
    assert result.manifest.license.verifiedOn == "2026-10-31"
    loaded = manifest.load(result.manifest_path)
    assert loaded == result.manifest
    manifest.verify(loaded, result.model_path.read_bytes())


def test_without_an_auc_check_int8_is_not_kept(tmp_path: Path) -> None:
    result = _small_export(tmp_path, auc=False)
    assert result.manifest.quantization.value == "fp32"
    assert result.model_path.name.endswith(".fp32.onnx")


def test_export_is_deterministic(tmp_path: Path) -> None:
    a = _small_export(tmp_path / "a")
    b = _small_export(tmp_path / "b")
    assert a.manifest.sha256 == b.manifest.sha256


@pytest.mark.parametrize(
    ("fp32", "int8", "keep"), [(0.9, 0.89, True), (0.9, 0.8899, False), (0.9, 0.95, True)]
)
def test_int8_is_kept_only_within_the_auc_budget(fp32: float, int8: float, *, keep: bool) -> None:
    assert export.keep_int8(fp32, int8) is keep


def test_parity_failure_stops_the_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(export, "parity", lambda *_args: 0.5)
    with pytest.raises(export.ExportError, match="parity"):
        _small_export(tmp_path)
    assert not list(tmp_path.iterdir())


def test_inference_matches_the_exported_model(tmp_path: Path) -> None:
    result = _small_export(tmp_path, auc=False)
    model = inference.OnnxModel.from_manifest_file(result.manifest_path)
    window = export.fixture_windows(1, SMALL, seed=5)[0]
    expected = export.synthetic_model(SMALL)(__import__("torch").from_numpy(window)).detach()
    assert np.allclose(model.logits(window), expected.numpy(), atol=1e-4)
    assert 0.0 <= model.score(window) <= 1.0
    audio = export.fixture_windows(1, SMALL * 3, seed=6)[0]
    assert len(model.scores(audio)) == windows.window_count(SMALL * 3, SMALL, 64)


def test_inference_refuses_a_tampered_model(tmp_path: Path) -> None:
    result = _small_export(tmp_path, auc=False)
    data = bytearray(result.model_path.read_bytes())
    data[-1] ^= 0xFF
    with pytest.raises(manifest.IntegrityError, match="SHA-256"):
        inference.OnnxModel(result.manifest, bytes(data))
    with pytest.raises(manifest.IntegrityError, match="size"):
        inference.OnnxModel(result.manifest, bytes(data) + b"\0")


def test_inference_rejects_wrong_window_sizes(tmp_path: Path) -> None:
    result = _small_export(tmp_path, auc=False)
    model = inference.OnnxModel.from_manifest_file(result.manifest_path)
    with pytest.raises(inference.InferenceError, match="shape"):
        model.logits(np.zeros(SMALL - 1, dtype=np.float32))


def test_committed_synthetic_model_is_current(tmp_path: Path) -> None:
    folder = Path(__file__).resolve().parents[3] / "apps/web/public/models"
    committed = manifest.load(folder / f"{export.SYNTHETIC_ID}.json")
    manifest.verify(committed, (folder / committed.file).read_bytes())
    fresh = export.export_synthetic(tmp_path, TODAY).manifest
    assert committed.role.value == "test"
    assert committed.model_dump(exclude={"license"}) == fresh.model_dump(exclude={"license"})


@pytest.mark.parametrize(
    ("samples", "window", "hop", "count"),
    [(0, 4, 2, 0), (3, 4, 2, 0), (4, 4, 2, 1), (5, 4, 2, 1), (6, 4, 2, 2), (10, 4, 3, 3)],
)
def test_window_count(samples: int, window: int, hop: int, count: int) -> None:
    assert windows.window_count(samples, window, hop) == count
    audio = np.arange(samples, dtype=np.float32)
    framed = windows.frame(audio, window, hop)
    assert framed.shape == (count, window)
    for i, row in enumerate(framed):
        assert row.tolist() == audio[i * hop : i * hop + window].tolist()


# Feature: detection-model, Property 4: Manifest hash integrity
@settings(max_examples=200)
@given(
    data=st.one_of(st.binary(min_size=1, max_size=4096), st.sampled_from([b"\0", b"\xff" * 64])),
    position=st.integers(min_value=0),
    flip=st.integers(min_value=1, max_value=255),
)
def test_property_manifest_hash_integrity(data: bytes, position: int, flip: int) -> None:
    base = export.synthetic_spec()
    recorded = manifest.ModelManifest.model_validate(
        {
            "id": base.model_id, "version": base.version, "role": "test", "file": "m.onnx",
            "sha256": manifest.sha256_hex(data), "bytes": len(data), "quantization": "fp32",
            "sampleRate": 16000, "windowSamples": 4, "hopSamples": 2, "input": "waveform",
            "output": "logits", "outputKind": "two-class-logits", "spoofIndex": 1,
            "calibration": {"method": "temperature", "temperature": 1.0},
            "thresholds": base.thresholds,
            "license": {**base.license, "verifiedOn": "2026-10-31"}, "source": "test",
        }
    )  # fmt: skip
    manifest.verify(recorded, data)
    changed = bytearray(data)
    changed[position % len(data)] ^= flip
    with pytest.raises(manifest.IntegrityError):
        manifest.verify(recorded, bytes(changed))
