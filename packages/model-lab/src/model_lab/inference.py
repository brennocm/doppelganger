"""Shared ONNX Runtime inference for the model lab, the Pro engine and the MCP server.

This is the published inference module (structure steering): it depends only on NumPy,
onnxruntime and the generated contracts. A model is loaded only after its bytes match
the SHA-256 in its manifest (security steering).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

import numpy as np
import numpy.typing as npt
import onnxruntime as ort

from model_lab import calibration, manifest
from model_lab.haunting import INITIAL, Event, HauntingConfig, MachineState, Smoother, transition
from model_lab.windows import frame

if TYPE_CHECKING:
    from pathlib import Path

    from doppelganger_contracts.generated.model_manifest_schema import ModelManifest

# The detector primitives the engine needs, re-exported so that it imports model_lab only
# through this published module (structure steering, local-runtime P29).
__all__ = [
    "INITIAL",
    "Event",
    "HauntingConfig",
    "InferenceError",
    "MachineState",
    "OnnxModel",
    "Smoother",
    "score_logits",
    "transition",
]

Audio = npt.NDArray[np.float32]
SAMPLE_RATE: Final = 16_000


class InferenceError(RuntimeError):
    """The model produced unusable output or got unusable input."""


def score_logits(logits: list[float], model_manifest: ModelManifest) -> float:
    """Calibrated Dissonance_Score of one raw model output (same rules as the TS scorer)."""
    try:
        return calibration.calibrate(
            logits,
            model_manifest.outputKind.value,
            model_manifest.spoofIndex,
            model_manifest.calibration.temperature,
        )
    except calibration.CalibrationError as error:
        raise InferenceError(str(error)) from error


class OnnxModel:
    """One verified model with its calibration; runs one window at a time."""

    def __init__(self, model_manifest: ModelManifest, model_bytes: bytes) -> None:
        """Verify the bytes against the manifest, then create a single-thread session."""
        manifest.verify(model_manifest, model_bytes)
        self.manifest = model_manifest
        options = ort.SessionOptions()
        # One thread and sequential execution keep scores deterministic (Requirement 2.5).
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.log_severity_level = 3
        self._session = ort.InferenceSession(
            model_bytes, sess_options=options, providers=["CPUExecutionProvider"]
        )

    @classmethod
    def from_manifest_file(cls, path: Path) -> OnnxModel:
        """Load the manifest and the model file next to it."""
        loaded = manifest.load(path)
        return cls(loaded, (path.parent / loaded.file).read_bytes())

    def logits(self, window: Audio) -> npt.NDArray[np.float32]:
        """Raw model output for one window of exactly windowSamples samples."""
        size = self.manifest.windowSamples
        if window.shape != (size,):
            msg = f"window must have shape ({size},), got {window.shape}"
            raise InferenceError(msg)
        batch = np.ascontiguousarray(window, dtype=np.float32).reshape(1, size)
        (out,) = self._session.run([self.manifest.output], {self.manifest.input: batch})
        result: npt.NDArray[np.float32] = np.asarray(out, dtype=np.float32).reshape(-1)
        return result

    def margin(self, window: Audio) -> float:
        """Spoof margin of one window (see model_lab.calibration)."""
        try:
            return calibration.spoof_margin(
                self.logits(window).tolist(),
                self.manifest.outputKind.value,
                self.manifest.spoofIndex,
            )
        except calibration.CalibrationError as error:
            raise InferenceError(str(error)) from error

    def score(self, window: Audio) -> float:
        """Calibrated Dissonance_Score in [0, 1] of one window."""
        return calibration.sigmoid(self.margin(window) / self.manifest.calibration.temperature)

    def scores(self, audio: Audio) -> list[float]:
        """Scores of every full window of a 16 kHz mono signal, in order."""
        windows = frame(audio, self.manifest.windowSamples, self.manifest.hopSamples)
        return [self.score(w) for w in windows]
