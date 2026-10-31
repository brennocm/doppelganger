import json
import math

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from model_lab import calibration as cal
from model_lab import golden

FINITE = st.floats(allow_nan=False, allow_infinity=False, width=64)
EDGE = st.sampled_from([0.0, -0.0, 1e-300, -1e-300, 1e308, -1e308, 745.0, -745.0])
LOGIT = st.one_of(FINITE, EDGE)
NON_FINITE = st.sampled_from([math.nan, math.inf, -math.inf])
TEMPERATURE = st.one_of(st.floats(min_value=1e-3, max_value=1e3), st.sampled_from([1e-3, 1.0, 1e3]))


def _logits(kind: cal.OutputKind) -> st.SearchStrategy[list[float]]:
    size = 1 if kind == "single-logit" else 2
    return st.lists(LOGIT, min_size=size, max_size=size)


KIND_AND_LOGITS = st.sampled_from(cal.OUTPUT_KINDS).flatmap(
    lambda kind: st.tuples(st.just(kind), _logits(kind), st.integers(0, 1))
)


# Feature: detection-model, Property 1: Calibrated output is a probability
@settings(max_examples=200)
@given(case=KIND_AND_LOGITS, temperature=TEMPERATURE, bad=NON_FINITE, position=st.integers(0, 1))
def test_property_calibrated_output_is_a_probability(
    case: tuple[cal.OutputKind, list[float], int], temperature: float, bad: float, position: int
) -> None:
    kind, logits, spoof = case
    spoof = 0 if kind == "single-logit" else spoof
    try:
        p = cal.calibrate(logits, kind, spoof, temperature)
    except cal.CalibrationError:
        # Only an overflowing two-class margin (e.g. 1e308 - -1e308) may be rejected.
        assert kind == "two-class-logits"
        assert not math.isfinite(logits[0] - logits[1])
    else:
        assert 0.0 <= p <= 1.0
    poisoned = list(logits)
    poisoned[min(position, len(poisoned) - 1)] = bad
    with pytest.raises(cal.CalibrationError):
        cal.calibrate(poisoned, kind, spoof, temperature)


# Feature: detection-model, Property 2: Calibration is monotonic
@settings(max_examples=200)
@given(
    a=st.floats(min_value=-1e6, max_value=1e6),
    b=st.floats(min_value=-1e6, max_value=1e6),
    other=st.floats(min_value=-1e6, max_value=1e6),
    temperature=TEMPERATURE,
)
def test_property_calibration_is_monotonic(
    a: float, b: float, other: float, temperature: float
) -> None:
    low, high = sorted((a, b))
    for kind, lo_logits, hi_logits in (
        ("single-logit", [low], [high]),
        ("two-class-logits", [other, other + low], [other, other + high]),
    ):
        p_low = cal.calibrate(lo_logits, kind, 1 if kind != "single-logit" else 0, temperature)
        p_high = cal.calibrate(hi_logits, kind, 1 if kind != "single-logit" else 0, temperature)
        assert p_low <= p_high


def test_two_class_softmax_matches_the_margin_form() -> None:
    logits, t = [-1.2, 2.3], 1.7
    e = np.exp(np.array(logits) / t)
    assert cal.calibrate(logits, "two-class-logits", 1, t) == pytest.approx(e[1] / e.sum())
    assert cal.calibrate(logits, "two-class-logits", 0, t) == pytest.approx(e[0] / e.sum())


@pytest.mark.parametrize("temperature", [0.0, -1.0, math.nan, math.inf])
def test_bad_temperatures_are_rejected(temperature: float) -> None:
    with pytest.raises(cal.CalibrationError, match="temperature"):
        cal.calibrate([0.0], "single-logit", 0, temperature)


@pytest.mark.parametrize(
    ("logits", "kind", "spoof"),
    [
        ([1.0, 2.0], "single-logit", 0),
        ([1.0], "two-class-logits", 1),
        ([1.0, 2.0], "two-class-logits", 2),
    ],
)
def test_wrong_shapes_are_rejected(logits: list[float], kind: cal.OutputKind, spoof: int) -> None:
    with pytest.raises(cal.CalibrationError):
        cal.calibrate(logits, kind, spoof, 1.0)


def test_fit_temperature_recovers_a_known_temperature() -> None:
    rng = np.random.default_rng(0)
    true_t = 2.5
    z = rng.normal(0.0, 6.0, 40_000)
    y = (rng.uniform(size=z.size) < cal.calibrate_margins(z, true_t)).astype(np.float64)
    assert cal.fit_temperature(z, y) == pytest.approx(true_t, rel=0.05)


def test_fitting_lowers_ece_on_overconfident_scores() -> None:
    rng = np.random.default_rng(1)
    z = rng.normal(0.0, 8.0, 20_000)
    y = (rng.uniform(size=z.size) < cal.calibrate_margins(z, 4.0)).astype(np.float64)
    before = cal.expected_calibration_error(cal.calibrate_margins(z, 1.0), y)
    after = cal.expected_calibration_error(cal.calibrate_margins(z, cal.fit_temperature(z, y)), y)
    assert after < before
    assert after < 0.02  # noqa: PLR2004


def test_ece_edge_cases() -> None:
    assert cal.expected_calibration_error([], []) == 0.0
    assert cal.expected_calibration_error([1.0, 0.0], [1, 0]) == 0.0
    assert cal.expected_calibration_error([1.0, 1.0], [0, 0]) == 1.0


@pytest.mark.parametrize(
    ("margins", "labels"),
    [([], []), ([1.0], [0, 1]), ([math.nan], [1]), ([1.0], [0.5])],
)
def test_fit_rejects_bad_input(margins: list[float], labels: list[float]) -> None:
    with pytest.raises(cal.CalibrationError):
        cal.fit_temperature(margins, labels)


def test_committed_calibration_golden_vectors_are_current() -> None:
    committed = (golden.GOLDEN_DIR / "calibration.json").read_text(encoding="utf-8")
    assert json.loads(committed) == golden.calibration_vectors()
    for case in json.loads(committed)["cases"]:
        got = cal.calibrate(
            case["logits"], case["outputKind"], case["spoofIndex"], case["temperature"]
        )
        assert got == pytest.approx(case["score"], abs=golden.TOLERANCE)
