"""The MCP tools' logic on top of `model_lab.inference` (kiro-workbench Requirement 7, P36).

Same decoder, windowing, voice activity check, scoring and verdict as the engine's Autopsy.
Audio stays in memory; nothing is written and nothing goes over the network.
"""

from __future__ import annotations

import os
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, Final

from doppelganger_mcp import sandbox
from model_lab.inference import (
    HauntingConfig,
    OnnxModel,
    StreamSession,
    TooLongError,
    UnsupportedAudioError,
    analyze,
    load_manifest,
    to_16k_mono,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from doppelganger_contracts.generated.model_manifest_schema import ModelManifest

MODELS_ENV: Final = "DOPPELGANGER_MCP_MODELS"
DEFAULT_MODEL_DIRS: Final = (sandbox.REPO_ROOT / "apps" / "web" / "public" / "models",)
NOTE: Final = (
    "The Dissonance_Score is a probabilistic estimate that a voice is synthetic. It is not "
    "proof and it does not identify a person. See docs/model-card.md for what the model "
    "can and cannot do."
)


class AnalysisError(ValueError):
    """A problem the caller can fix: unsupported audio, unknown model, too long."""


def model_dirs_from_env(environ: dict[str, str] | None = None) -> tuple[Path, ...]:
    """Manifest folders: `DOPPELGANGER_MCP_MODELS` (`:`-separated) or the web app's models."""
    raw = (environ if environ is not None else dict(os.environ)).get(MODELS_ENV, "")
    parts = [p for p in raw.split(os.pathsep) if p.strip()]
    return tuple(Path(p) for p in parts) if parts else DEFAULT_MODEL_DIRS


def manifests(dirs: Sequence[Path]) -> list[tuple[Path, ModelManifest]]:
    """Every valid manifest in the folders, sorted by path; invalid files are skipped."""
    found: list[tuple[Path, ModelManifest]] = []
    for folder in dirs:
        for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
            try:
                found.append((path, load_manifest(path)))
            except (OSError, ValueError):
                continue
    return found


def list_models(dirs: Sequence[Path]) -> list[dict[str, object]]:
    """Manifest summaries (Requirement 7.2)."""
    return [
        {
            "id": m.id,
            "version": m.version,
            "role": m.role.value,
            "sha256": m.sha256,
            "license": m.license.model_dump(mode="json"),
            "window_samples": m.windowSamples,
            "hop_samples": m.hopSamples,
        }
        for _, m in manifests(dirs)
    ]


def load_model(dirs: Sequence[Path], model_id: str | None) -> OnnxModel:
    """The requested model (or the first one), loaded only after its hash is verified."""
    found = manifests(dirs)
    for path, m in found:
        if model_id is None or m.id == model_id:
            try:
                return OnnxModel.from_manifest_file(path)
            except (OSError, ValueError) as error:  # missing file or SHA-256 mismatch
                msg = f"model {m.id} failed its integrity check and was not loaded"
                raise AnalysisError(msg) from error
    known = ", ".join(m.id for _, m in found) or "none"
    msg = f"unknown model {model_id!r}; available: {known}"
    raise AnalysisError(msg)


def analyze_bytes(data: bytes, model: OnnxModel) -> dict[str, object]:
    """Autopsy of WAV bytes, in the MCP tool's output shape (Requirement 7.1)."""
    try:
        samples = to_16k_mono(data)
    except UnsupportedAudioError:
        msg = "unsupported audio: the MCP server reads WAV files only (like the engine)"
        raise AnalysisError(msg) from None
    except TooLongError:
        msg = "recording is longer than 5 minutes"
        raise AnalysisError(msg) from None
    session = StreamSession(model.manifest, lambda w: model.logits(w).tolist())
    report = analyze(samples, session)
    windows = [{"start_s": w.startS, "end_s": w.endS, "score": w.score} for w in report.windows]
    scores = [w.score for w in report.windows if w.score is not None]
    return {
        "model_id": report.modelId,
        "duration_s": report.durationS,
        "windows": windows,
        "summary": {
            "peak": max(scores) if scores else None,
            "mean": sum(scores) / len(scores) if scores else None,
            "state_timeline": [s.model_dump(mode="json", by_alias=True) for s in report.states],
            "verdict": report.verdict.value,
            "verdict_reason": report.verdictReason,
        },
        "note": NOTE,
    }


def explain_thresholds() -> dict[str, object]:
    """The settings the Autopsy verdict uses, explained (Requirement 7.3)."""
    cfg = HauntingConfig()
    return {
        **asdict(cfg),
        "explanation": (
            f"Each window gets a Dissonance_Score in [0, 1]. Scores are smoothed with an "
            f"exponential moving average (alpha {cfg.alpha}). Below {cfg.unease} the state is "
            f"Mask, at or above it Unease. Possession needs {cfg.confirm_windows} windows in a "
            f"row with a smoothed score at or above {cfg.possession}, and it is left only after "
            f"{cfg.release_windows} windows in a row below {cfg.release}. {cfg.silence_ms} ms "
            "without speech returns Mask or Unease to Listening; silence never ends Possession. "
            "A verdict needs at least 3 scored windows. " + NOTE
        ),
    }
