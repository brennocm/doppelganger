"""Golden vectors shared by the TypeScript and Python test suites (testing steering).

Run ``uv run --locked python -m model_lab.golden`` and then ``mise run fix`` (Biome formats
JSON) to rewrite them. The tests on both sides assert against the parsed committed files,
so any drift between implementations fails.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final

from model_lab.calibration import OutputKind, calibrate

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


FILES: Final = {"calibration.json": calibration_vectors}


def main() -> int:
    """Rewrite every golden file."""
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    for name, build in FILES.items():
        (GOLDEN_DIR / name).write_text(render(build()), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
