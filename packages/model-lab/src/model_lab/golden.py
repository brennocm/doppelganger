"""Golden vectors shared by the TypeScript and Python test suites (testing steering).

Run ``uv run --locked python -m model_lab.golden`` and then ``mise run fix`` (Biome formats
JSON) to rewrite them. The tests on both sides assert against the parsed committed files,
so any drift between implementations fails.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final

import numpy as np

from model_lab.calibration import OutputKind, calibrate
from model_lab.windows import frame

GOLDEN_DIR: Final = Path(__file__).resolve().parents[4] / "packages/contracts/fixtures/golden"
TOLERANCE: Final = 1e-12

_CALIBRATION_INPUTS: Final[list[tuple[OutputKind, int, float, list[float]]]] = [
    ("two-class-logits", 1, 1.0, [0.0, 0.0]),
    ("two-class-logits", 1, 1.0, [-1.2, 2.3]),
    ("two-class-logits", 1, 1.7, [-1.2, 2.3]),
    ("two-class-logits", 0, 1.7, [-1.2, 2.3]),
    ("two-class-logits", 1, 0.5, [3.0, -4.0]),
    ("two-class-logits", 1, 3.0, [12.5, 11.0]),
    ("two-class-logits", 1, 1.0, [-50.0, 50.0]),
    ("two-class-logits", 1, 1.0, [50.0, -50.0]),
    ("two-class-logits", 0, 0.25, [400.0, -400.0]),
    ("single-logit", 0, 1.0, [0.0]),
    ("single-logit", 0, 1.0, [2.0]),
    ("single-logit", 0, 2.5, [-3.75]),
    ("single-logit", 0, 0.8, [0.4]),
    ("single-logit", 0, 1.0, [-745.0]),
    ("single-logit", 0, 1.0, [745.0]),
]


def calibration_vectors() -> dict[str, object]:
    """Inputs and expected Dissonance_Scores for calibration."""
    cases = [
        {
            "outputKind": kind,
            "spoofIndex": spoof,
            "temperature": temperature,
            "logits": logits,
            "score": calibrate(logits, kind, spoof, temperature),
        }
        for kind, spoof, temperature, logits in _CALIBRATION_INPUTS
    ]
    return {
        "description": "Temperature-scaled spoof probability (detection-model design, Calibration)",
        "tolerance": TOLERANCE,
        "cases": cases,
    }


def render(vectors: dict[str, object]) -> str:
    """Serialize vectors in the committed format."""
    return json.dumps(vectors, indent=2) + "\n"


# (samples, windowSamples, hopSamples, chunk lengths). Chunk lengths sum to samples; the
# TS Windower is fed each split and must emit the same windows (detection-core 1.2).
_WINDOWING_INPUTS: Final[list[tuple[int, int, int, list[list[int]]]]] = [
    (0, 4, 2, [[]]),
    (3, 4, 2, [[3], [1, 1, 1]]),
    (4, 4, 2, [[4], [0, 4, 0]]),
    (11, 4, 2, [[11], [1] * 11, [5, 6], [3, 0, 8]]),
    (12, 4, 4, [[12], [7, 5]]),
    (15, 3, 5, [[15], [2, 2, 2, 2, 2, 2, 3], [14, 1]]),
    (9, 5, 1, [[9], [4, 1, 4]]),
    (20, 6, 3, [[20], [19, 1], [1, 19], [6, 6, 6, 2]]),
]


def golden_signal(samples: int) -> list[float]:
    """A deterministic test signal whose values are exact in float32 (multiples of 1/64)."""
    return [((i * 37) % 101 - 50) / 64 for i in range(samples)]


def windowing_vectors() -> dict[str, object]:
    """Inputs and expected windows for the Windower (detection-core Requirement 1)."""
    cases = []
    for samples, window, hop, splits in _WINDOWING_INPUTS:
        signal = golden_signal(samples)
        framed = frame(np.asarray(signal, dtype=np.float32), window, hop)
        cases.append(
            {
                "windowSamples": window,
                "hopSamples": hop,
                "signal": signal,
                "chunkings": splits,
                "windows": [
                    {"index": i, "startSample": i * hop, "samples": [float(v) for v in row]}
                    for i, row in enumerate(framed)
                ],
            }
        )
    return {
        "description": "Window i is signal[i*hop : i*hop + windowSamples] (detection-core design)",
        "cases": cases,
    }


FILES: Final = {"calibration.json": calibration_vectors, "windowing.json": windowing_vectors}


def main() -> int:
    """Rewrite every golden file."""
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    for name, build in FILES.items():
        (GOLDEN_DIR / name).write_text(render(build()), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
