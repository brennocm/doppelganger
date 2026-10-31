"""Temperature scaling and expected calibration error (detection-model Requirement 4).

``p = sigmoid(z / T)`` for single-logit models and ``softmax(z / T)[spoof_index]`` for
two-class models. For two classes the softmax equals ``sigmoid((z_spoof - z_other) / T)``,
so both reduce to a spoof margin. NumPy only: the engine uses this at runtime.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Final, Literal

import numpy as np
import numpy.typing as npt

if TYPE_CHECKING:
    from collections.abc import Sequence

OutputKind = Literal["single-logit", "two-class-logits"]
OUTPUT_KINDS: Final[tuple[OutputKind, ...]] = ("single-logit", "two-class-logits")
ECE_BINS: Final = 15
_LOG_A_RANGE: Final = (-7.0, 7.0)  # inverse temperature between about 1e-3 and 1e3
_GOLDEN: Final = (math.sqrt(5.0) - 1.0) / 2.0
_SEARCH_STEPS: Final = 120

Floats = npt.NDArray[np.float64]


class CalibrationError(ValueError):
    """Model output or calibration parameters are not usable."""


def spoof_margin(logits: Sequence[float], kind: OutputKind, spoof_index: int) -> float:
    """Return the spoof margin z of one model output, rejecting non-finite values."""
    values = [float(v) for v in logits]
    if not all(math.isfinite(v) for v in values):
        msg = "model output contains NaN or infinite values"
        raise CalibrationError(msg)
    if kind == "single-logit":
        if len(values) != 1:
            msg = f"single-logit output must have 1 value, got {len(values)}"
            raise CalibrationError(msg)
        return values[0]
    if len(values) != 2 or spoof_index not in (0, 1):  # noqa: PLR2004
        msg = "two-class output must have 2 values and spoof_index 0 or 1"
        raise CalibrationError(msg)
    margin = values[spoof_index] - values[1 - spoof_index]
    if not math.isfinite(margin):
        msg = "spoof margin overflowed"
        raise CalibrationError(msg)
    return margin


def _check_temperature(temperature: float) -> None:
    if not (math.isfinite(temperature) and temperature > 0.0):
        msg = "temperature must be finite and greater than 0"
        raise CalibrationError(msg)


def sigmoid(x: float) -> float:
    """Numerically stable logistic function."""
    if x >= 0.0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def calibrate(
    logits: Sequence[float], kind: OutputKind, spoof_index: int, temperature: float
) -> float:
    """Calibrated Dissonance_Score in [0, 1] for one model output."""
    _check_temperature(temperature)
    return sigmoid(spoof_margin(logits, kind, spoof_index) / temperature)


def _sigmoid_array(x: Floats) -> Floats:
    out: Floats = np.empty_like(x)
    positive = x >= 0
    out[positive] = 1.0 / (1.0 + np.exp(-x[positive]))
    e = np.exp(x[~positive])
    out[~positive] = e / (1.0 + e)
    return out


def calibrate_margins(margins: npt.ArrayLike, temperature: float) -> Floats:
    """Vectorized calibration of spoof margins."""
    _check_temperature(temperature)
    z = np.asarray(margins, dtype=np.float64)
    if not np.all(np.isfinite(z)):
        msg = "margins contain NaN or infinite values"
        raise CalibrationError(msg)
    return _sigmoid_array(z / temperature)


def _nll(log_a: float, z: Floats, y: Floats) -> float:
    s = z * math.exp(log_a)
    # -log sigmoid(s) = logaddexp(0, -s); labels: 1 = synthetic (spoof).
    return float(np.mean(y * np.logaddexp(0.0, -s) + (1.0 - y) * np.logaddexp(0.0, s)))


def fit_temperature(margins: npt.ArrayLike, labels: npt.ArrayLike) -> float:
    """Fit T by minimizing negative log-likelihood (labels: 1 synthetic, 0 genuine).

    The NLL is convex in 1/T, so a golden-section search over log(1/T) finds the minimum.
    The result is clamped to the search range, which also covers anti-correlated data.
    """
    z = np.asarray(margins, dtype=np.float64)
    y = np.asarray(labels, dtype=np.float64)
    if z.shape != y.shape or z.ndim != 1 or z.size == 0:
        msg = "margins and labels must be non-empty 1-D arrays of the same length"
        raise CalibrationError(msg)
    if not np.all(np.isfinite(z)) or not np.all((y == 0.0) | (y == 1.0)):
        msg = "margins must be finite and labels must be 0 or 1"
        raise CalibrationError(msg)
    lo, hi = _LOG_A_RANGE
    c, d = hi - _GOLDEN * (hi - lo), lo + _GOLDEN * (hi - lo)
    fc, fd = _nll(c, z, y), _nll(d, z, y)
    for _ in range(_SEARCH_STEPS):
        if fc <= fd:
            hi, d, fd = d, c, fc
            c = hi - _GOLDEN * (hi - lo)
            fc = _nll(c, z, y)
        else:
            lo, c, fc = c, d, fd
            d = lo + _GOLDEN * (hi - lo)
            fd = _nll(d, z, y)
    return 1.0 / math.exp((lo + hi) / 2.0)


def expected_calibration_error(
    probabilities: npt.ArrayLike, labels: npt.ArrayLike, bins: int = ECE_BINS
) -> float:
    """ECE with equal-width bins over [0, 1] (the last bin includes 1.0)."""
    p = np.asarray(probabilities, dtype=np.float64)
    y = np.asarray(labels, dtype=np.float64)
    if p.shape != y.shape or p.ndim != 1:
        msg = "probabilities and labels must be 1-D arrays of the same length"
        raise CalibrationError(msg)
    if p.size == 0:
        return 0.0
    index = np.minimum((p * bins).astype(np.int64), bins - 1)
    total = 0.0
    for b in range(bins):
        mask = index == b
        if np.any(mask):
            total += float(mask.mean()) * abs(float(p[mask].mean()) - float(y[mask].mean()))
    return total
