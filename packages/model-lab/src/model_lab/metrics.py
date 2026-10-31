"""Detection metrics: ROC AUC, EER, and rates at a threshold (Requirement 2.2).

Labels: 1 = synthetic (spoof), 0 = genuine. Higher scores mean "more synthetic".
Metrics that need both classes are None when one class is missing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from sklearn.metrics import roc_auc_score, roc_curve


@dataclass(frozen=True)
class Metrics:
    """Metrics of one model on one dataset and condition."""

    genuine: int
    synthetic: int
    auc: float | None
    eer: float | None
    false_alarm_rate: float | None
    detection_rate: float | None


def eer(labels: npt.ArrayLike, scores: npt.ArrayLike) -> float:
    """Equal error rate, interpolated on the ROC where FPR equals FNR."""
    fpr, tpr, _ = roc_curve(labels, scores)
    fnr = 1.0 - tpr
    diff = fpr - fnr  # increases from <= 0 to >= 0 along the curve
    i = int(np.argmax(diff >= 0.0))
    if i == 0 or diff[i] == 0.0:
        return float((fpr[i] + fnr[i]) / 2.0)
    # Linear interpolation between points i-1 and i, where diff changes sign.
    t = -diff[i - 1] / (diff[i] - diff[i - 1])
    return float(fpr[i - 1] + t * (fpr[i] - fpr[i - 1]))


def compute(labels: npt.ArrayLike, scores: npt.ArrayLike, threshold: float) -> Metrics:
    """All Requirement 2.2 metrics; rates use score >= threshold as an alarm."""
    y = np.asarray(labels, dtype=np.int64)
    s = np.asarray(scores, dtype=np.float64)
    if y.shape != s.shape or not np.all(np.isfinite(s)):
        msg = "labels and scores must have the same shape and finite scores"
        raise ValueError(msg)
    genuine, synthetic = int(np.sum(y == 0)), int(np.sum(y == 1))
    alarm = s >= threshold
    far = float(np.mean(alarm[y == 0])) if genuine else None
    detection = float(np.mean(alarm[y == 1])) if synthetic else None
    both = genuine > 0 and synthetic > 0
    return Metrics(
        genuine=genuine,
        synthetic=synthetic,
        auc=float(roc_auc_score(y, s)) if both else None,
        eer=eer(y, s) if both else None,
        false_alarm_rate=far,
        detection_rate=detection,
    )


def percentile(values: list[float], q: float) -> float | None:
    """Linear-interpolated percentile, None for an empty list."""
    if not values:
        return None
    result = float(np.percentile(np.asarray(values, dtype=np.float64), q))
    return result if math.isfinite(result) else None
