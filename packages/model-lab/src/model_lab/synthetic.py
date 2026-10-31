"""Seeded synthetic signals for tests: sine, noise, silence and chirps (testing steering).

No audio file is ever read or committed for tests; every signal is generated here.
"""

from __future__ import annotations

from typing import Final, Literal

import numpy as np

from model_lab.codecs import SAMPLE_RATE, Audio

Kind = Literal["sine", "noise", "silence", "chirp"]
KINDS: Final[tuple[Kind, ...]] = ("sine", "noise", "silence", "chirp")


def signal(kind: Kind, samples: int, seed: int = 0, amplitude: float = 0.5) -> Audio:
    """Return a 16 kHz mono float32 test signal of the given length."""
    rng = np.random.default_rng(seed)
    t = np.arange(samples, dtype=np.float64) / SAMPLE_RATE
    match kind:
        case "silence":
            out = np.zeros(samples)
        case "noise":
            out = rng.uniform(-1.0, 1.0, samples)
        case "sine":
            frequency = rng.uniform(100.0, 4000.0)
            out = np.sin(2 * np.pi * frequency * t)
        case "chirp":
            start, stop = rng.uniform(100.0, 1000.0), rng.uniform(2000.0, 7000.0)
            duration = max(samples / SAMPLE_RATE, 1 / SAMPLE_RATE)
            out = np.sin(2 * np.pi * (start * t + (stop - start) * t * t / (2 * duration)))
    return (amplitude * out).astype(np.float32)
