import json
from typing import Any

import pytest

from model_lab import golden
from model_lab import haunting as h

GOLDEN = json.loads((golden.GOLDEN_DIR / "haunting.json").read_text(encoding="utf-8"))


def _config(raw: dict[str, Any]) -> h.HauntingConfig:
    return h.HauntingConfig(
        alpha=raw["alpha"],
        unease=raw["unease"],
        possession=raw["possession"],
        release=raw["release"],
        confirm_windows=raw["confirmWindows"],
        release_windows=raw["releaseWindows"],
        silence_ms=raw["silenceMs"],
    )


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: c["name"])
def test_matches_the_ts_golden_vectors(case: dict[str, Any]) -> None:
    cfg = _config(case["config"])
    smoother = h.Smoother(cfg.alpha)
    state = h.INITIAL
    smoothed: float | None = None
    for step in case["steps"]:
        event = step["event"]
        if event["type"] == "window-scored":
            smoothed = smoother.next(event["raw"])
        elif event["type"] == "capture-stopped":
            smoother.reset()
            smoothed = None
        state = h.transition(state, h.Event(event["type"], event["at"], smoothed), cfg)
        assert state.state == step["expect"]["state"]
        if step["expect"]["smoothed"] is None:
            assert smoothed is None
        else:
            assert smoothed == pytest.approx(step["expect"]["smoothed"], abs=1e-12)


def test_defaults_equal_the_ts_defaults() -> None:
    assert _config(GOLDEN["cases"][0]["config"]) == h.HauntingConfig()


def test_replay_reaches_possession_only_after_confirmation() -> None:
    assert h.replay([0.95, 0.95, 0.95], h.HauntingConfig(alpha=1.0)) == [
        "unease",
        "unease",
        "possession",
    ]
    assert h.replay([], h.HauntingConfig()) == []


@pytest.mark.parametrize(
    "kwargs",
    [{"release": 0.7}, {"unease": 0.8}, {"alpha": 0.0}, {"confirm_windows": 0}],
)
def test_rejects_invalid_configurations(kwargs: dict[str, float]) -> None:
    with pytest.raises(ValueError, match="must"):
        h.HauntingConfig(**kwargs)  # type: ignore[arg-type]


def test_smoother_rejects_non_finite_scores() -> None:
    with pytest.raises(ValueError, match="finite"):
        h.Smoother(0.5).next(float("nan"))
