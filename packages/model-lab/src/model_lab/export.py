"""ONNX export, int8 quantization and parity checks (detection-model Requirement 5).

``python -m model_lab.export synthetic --out <dir>`` exports the synthetic CI model: a
fixed, seeded linear layer that detects nothing. It exercises the whole pipeline (export,
parity, quantization, manifest) without downloading weights, and stands in for the real
Light_Model until the gate picks one (its manifest says ``role: test``).
"""

from __future__ import annotations

import argparse
import datetime as dt
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import numpy as np
import numpy.typing as npt
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from sklearn.metrics import roc_auc_score

from model_lab import calibration, manifest
from model_lab.manifest import ModelManifest

OPSET: Final = 17
INPUT: Final = "waveform"
OUTPUT: Final = "logits"
PARITY_WINDOWS: Final = 200
PARITY_TOLERANCE: Final = 1e-3
MAX_INT8_AUC_DROP: Final = 0.01
SYNTHETIC_ID: Final = "ci-synthetic-linear"
SYNTHETIC_WINDOW: Final = 64_600
SYNTHETIC_HOP: Final = 16_000

Windows = npt.NDArray[np.float32]
#: Given fp32 and int8 model bytes, return (fp32 AUC, int8 AUC) on an evaluation set.
AucCheck = Callable[[bytes, bytes], tuple[float, float]]


class ExportError(RuntimeError):
    """Export or verification failed."""


@dataclass(frozen=True)
class ExportSpec:
    """Everything the manifest needs besides the file, hash and size."""

    model_id: str
    version: str
    role: str
    window_samples: int
    hop_samples: int
    output_kind: calibration.OutputKind
    spoof_index: int
    temperature: float
    license: dict[str, str]
    source: str
    thresholds: dict[str, float] = field(
        default_factory=lambda: {"unease": 0.4, "possession": 0.7, "release": 0.5}
    )


@dataclass(frozen=True)
class ExportResult:
    """What was written and the evidence for it."""

    manifest: ModelManifest
    model_path: Path
    manifest_path: Path
    max_abs_diff: float
    int8_auc: tuple[float, float] | None


def fixture_windows(count: int, window: int, seed: int = 0) -> Windows:
    """Seeded random windows in [-1, 1] for parity checks."""
    rng = np.random.default_rng(seed)
    return rng.uniform(-1.0, 1.0, (count, window)).astype(np.float32)


def to_onnx(module: torch.nn.Module, window: int) -> bytes:
    """Export with a static [1, window] input named waveform and an output named logits."""
    module.eval()
    with tempfile.TemporaryDirectory(prefix="model-lab-export-") as tmp, torch.no_grad():
        target = Path(tmp) / "model.onnx"
        torch.onnx.export(
            module,
            (torch.zeros(1, window),),
            target,
            input_names=[INPUT],
            output_names=[OUTPUT],
            opset_version=OPSET,
            dynamo=False,  # TorchScript exporter: no onnxscript dependency (ADR 0001)
        )
        return target.read_bytes()


def _session(model_bytes: bytes) -> ort.InferenceSession:
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.log_severity_level = 3
    return ort.InferenceSession(model_bytes, options, providers=["CPUExecutionProvider"])


def onnx_logits(model_bytes: bytes, windows: Windows) -> npt.NDArray[np.float32]:
    """Run every window through an ONNX model, one at a time like the app does."""
    session = _session(model_bytes)
    rows = [session.run([OUTPUT], {INPUT: w.reshape(1, -1)})[0].reshape(-1) for w in windows]
    return np.asarray(rows, dtype=np.float32)


def parity(module: torch.nn.Module, model_bytes: bytes, windows: Windows) -> float:
    """Max |PyTorch - ONNX Runtime| over the fixture windows.

    PyTorch also runs one window at a time: a batch of 200 AASIST windows needs several
    GB of activations and swaps on a 16 GB laptop (P32).
    """
    with torch.no_grad():
        rows = [module(torch.from_numpy(w.reshape(1, -1))).numpy().reshape(-1) for w in windows]
    expected = np.asarray(rows, dtype=np.float32)
    return float(np.max(np.abs(expected - onnx_logits(model_bytes, windows))))


def quantize_int8(model_bytes: bytes) -> bytes:
    """Dynamic int8 quantization of the weights (onnxruntime.quantization)."""
    with tempfile.TemporaryDirectory(prefix="model-lab-quant-") as tmp:
        source, target = Path(tmp) / "fp32.onnx", Path(tmp) / "int8.onnx"
        source.write_bytes(model_bytes)
        quantize_dynamic(source, target, weight_type=QuantType.QInt8)
        return target.read_bytes()


def keep_int8(fp32_auc: float, int8_auc: float) -> bool:
    """Requirement 5.2: keep int8 only if its AUC drop is at most 0.01."""
    return fp32_auc - int8_auc <= MAX_INT8_AUC_DROP + 1e-12  # float slack, e.g. 0.9 - 0.89


def agreement_auc_check(
    windows: Windows, output_kind: calibration.OutputKind, spoof_index: int
) -> AucCheck:
    """AUC check for models without labelled data (the synthetic CI model only).

    The fp32 model's own decisions (margin above its median) are the labels, so fp32
    scores AUC 1.0 and int8 scores how well it agrees. Real models use the Haunt_Set.
    """

    def margins(model_bytes: bytes) -> npt.NDArray[np.float64]:
        rows = onnx_logits(model_bytes, windows).tolist()
        return np.asarray([calibration.spoof_margin(r, output_kind, spoof_index) for r in rows])

    def check(fp32: bytes, int8: bytes) -> tuple[float, float]:
        reference = margins(fp32)
        labels = (reference > np.median(reference)).astype(np.int64)
        return float(roc_auc_score(labels, reference)), float(roc_auc_score(labels, margins(int8)))

    return check


def export_model(
    module: torch.nn.Module,
    spec: ExportSpec,
    out_dir: Path,
    auc_check: AucCheck | None,
    today: dt.date,
) -> ExportResult:
    """Export, verify parity, try int8, then write the model and its manifest."""
    fp32 = to_onnx(module, spec.window_samples)
    diff = parity(module, fp32, fixture_windows(PARITY_WINDOWS, spec.window_samples))
    if not diff <= PARITY_TOLERANCE:
        msg = f"{spec.model_id}: PyTorch/ONNX parity {diff:.2e} exceeds {PARITY_TOLERANCE:.0e}"
        raise ExportError(msg)
    chosen, quantization, aucs = fp32, "fp32", None
    if auc_check is not None:
        int8 = quantize_int8(fp32)
        aucs = auc_check(fp32, int8)
        if keep_int8(*aucs):
            chosen, quantization = int8, "int8"
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / f"{spec.model_id}.{quantization}.onnx"
    model_path.write_bytes(chosen)
    result_manifest = ModelManifest.model_validate(
        {
            "id": spec.model_id,
            "version": spec.version,
            "role": spec.role,
            "file": model_path.name,
            "sha256": manifest.sha256_hex(chosen),
            "bytes": len(chosen),
            "quantization": quantization,
            "sampleRate": 16_000,
            "windowSamples": spec.window_samples,
            "hopSamples": spec.hop_samples,
            "input": INPUT,
            "output": OUTPUT,
            "outputKind": spec.output_kind,
            "spoofIndex": spec.spoof_index,
            "calibration": {"method": "temperature", "temperature": spec.temperature},
            "thresholds": spec.thresholds,
            "license": {**spec.license, "verifiedOn": today.isoformat()},
            "source": spec.source,
        }
    )
    manifest_path = out_dir / f"{spec.model_id}.json"
    manifest.write(result_manifest, manifest_path)
    return ExportResult(result_manifest, model_path, manifest_path, diff, aucs)


def synthetic_model(window: int = SYNTHETIC_WINDOW, seed: int = 0) -> torch.nn.Module:
    """The synthetic CI model: one seeded linear layer from a window to two logits."""
    generator = torch.Generator().manual_seed(seed)
    layer = torch.nn.Linear(window, 2)
    with torch.no_grad():
        layer.weight.copy_(torch.randn(2, window, generator=generator) / window**0.5)
        layer.bias.zero_()
    return layer


def synthetic_spec(window: int = SYNTHETIC_WINDOW, hop: int = SYNTHETIC_HOP) -> ExportSpec:
    """Manifest fields of the synthetic CI model."""
    return ExportSpec(
        model_id=SYNTHETIC_ID,
        version="0.1.0",
        role="test",
        window_samples=window,
        hop_samples=hop,
        output_kind="two-class-logits",
        spoof_index=1,
        temperature=1.0,
        license={"code": "MIT", "weights": "MIT", "trainingData": "none (seeded random weights)"},
        source="packages/model-lab/src/model_lab/export.py (synthetic_model, seed 0)",
    )


def export_synthetic(out_dir: Path, today: dt.date) -> ExportResult:
    """Export the synthetic CI model into out_dir."""
    spec = synthetic_spec()
    check = agreement_auc_check(
        fixture_windows(PARITY_WINDOWS, spec.window_samples, seed=1),
        spec.output_kind,
        spec.spoof_index,
    )
    return export_model(synthetic_model(), spec, out_dir, check, today)


#: Where the committed synthetic CI model lives (detection-model design, Data Models).
SYNTHETIC_OUT: Final = Path("apps/web/public/models")


def main(argv: list[str] | None = None) -> int:
    """CLI entry point used by ``mise run model:export``."""
    parser = argparse.ArgumentParser(prog="model_lab.export", description=__doc__)
    parser.add_argument(
        "model", nargs="?", default="synthetic", choices=["synthetic", "aasist-l", "aasist"]
    )
    parser.add_argument("--out", type=Path, default=None, help="output folder")
    args = parser.parse_args(argv)
    if args.model != "synthetic":
        # Real candidates: fp32 ONNX into the cache unless --out is given (design P31).
        from model_lab import candidates  # noqa: PLC0415

        out = args.out or candidates.cache_dir() / "onnx"
        done = candidates.export_candidate(args.model, out)
        print(  # noqa: T201  (CLI output)
            f"exported {args.model} to {done.manifest_path} ({done.bytes} bytes, fp32), "
            f"parity max |diff| {done.max_abs_diff:.2e}"
        )
        return 0
    result = export_synthetic(args.out or SYNTHETIC_OUT, dt.datetime.now(dt.UTC).date())
    aucs = "skipped"
    if result.int8_auc is not None:
        aucs = "fp32 {:.4f} / int8 {:.4f}".format(*result.int8_auc)
    print(  # noqa: T201  (CLI output)
        f"exported {result.manifest.id}: {result.model_path.name} "
        f"({result.manifest.bytes} bytes, {result.manifest.quantization}), "
        f"parity max |diff| {result.max_abs_diff:.2e}, AUC {aucs}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
