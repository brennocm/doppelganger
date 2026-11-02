"""Calibrated scoring of one raw model output (kiro-workbench design P36).

Split out of `model_lab.inference` so that the pipeline modules can use it without an
import cycle; `model_lab.inference` re-exports both names.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from model_lab import calibration

if TYPE_CHECKING:
    from doppelganger_contracts.generated.model_manifest_schema import ModelManifest


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
