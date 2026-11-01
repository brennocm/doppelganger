"""Python port of the detector's EMA smoother and Haunting_Machine (detection-model 3.2).

Mirrors packages/detector/src/smoother.ts and haunting-machine.ts. Parity is asserted
against packages/contracts/fixtures/golden/haunting.json, which the TS tests write.
Used for the "after smoothing" rates of the evaluation (design, Evaluation).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Final, Literal

if TYPE_CHECKING:
    from collections.abc import Sequence

State = Literal["idle", "listening", "mask", "unease", "possession", "exorcised"]
EventType = Literal[
    "capture-started", "capture-stopped", "window-scored", "silence", "protocol-completed"
]


@dataclass(frozen=True)
class HauntingConfig:
    """The machine's part of DetectorConfig, defaults equal to the TS DEFAULT_CONFIG."""

    alpha: float = 0.4
    unease: float = 0.4
    possession: float = 0.7
    release: float = 0.5
    confirm_windows: int = 3
    release_windows: int = 5
    silence_ms: int = 2500

    def __post_init__(self) -> None:
        """Reject what the TS validateConfig rejects for these keys."""
        if not (0.0 < self.alpha <= 1.0):
            msg = "alpha must be in (0, 1]"
            raise ValueError(msg)
        if not (self.release < self.possession and self.unease <= self.possession):
            msg = "thresholds must satisfy release < possession and unease <= possession"
            raise ValueError(msg)
        if self.confirm_windows < 1 or self.release_windows < 1 or self.silence_ms < 0:
            msg = "window counts must be >= 1 and silence_ms >= 0"
            raise ValueError(msg)


@dataclass(frozen=True)
class Event:
    """One machine event; ``smoothed`` is set only for window-scored."""

    type: EventType
    at: float
    smoothed: float | None = None


@dataclass(frozen=True)
class MachineState:
    """State and counters, as in the TS MachineState."""

    state: State = "idle"
    above_count: int = 0
    below_count: int = 0
    last_voiced_at: float | None = None


INITIAL: Final = MachineState()


class Smoother:
    """EMA: the first score as is, then ``alpha * score + (1 - alpha) * previous``."""

    def __init__(self, alpha: float) -> None:
        """Create a smoother with no history."""
        if not (0.0 < alpha <= 1.0):
            msg = "alpha must be in (0, 1]"
            raise ValueError(msg)
        self._alpha = alpha
        self._previous: float | None = None

    def next(self, score: float) -> float:
        """Feed one score; return the smoothed value."""
        if not math.isfinite(score):
            msg = "score must be finite"
            raise ValueError(msg)
        prev = self._previous
        smoothed = score if prev is None else self._alpha * score + (1 - self._alpha) * prev
        self._previous = smoothed
        return smoothed

    def reset(self) -> None:
        """Forget all history."""
        self._previous = None


def _band(smoothed: float, cfg: HauntingConfig) -> State:
    return "mask" if smoothed < cfg.unease else "unease"


def _scored(s: MachineState, smoothed: float, at: float, cfg: HauntingConfig) -> MachineState:
    above = s.above_count + 1 if smoothed >= cfg.possession else 0
    below = s.below_count + 1 if smoothed < cfg.release else 0
    nxt = MachineState(s.state, above, below, at)
    if s.state == "possession":
        return replace(nxt, state=_band(smoothed, cfg) if below >= cfg.release_windows else s.state)
    if above >= cfg.confirm_windows:
        return replace(nxt, state="possession")
    if s.state == "exorcised" and smoothed >= cfg.possession:
        return nxt
    return replace(nxt, state=_band(smoothed, cfg))


def transition(s: MachineState, e: Event, cfg: HauntingConfig) -> MachineState:  # noqa: PLR0911
    """Pure transition function, identical to the TS ``transition``."""
    if e.type == "capture-started":
        return MachineState("listening") if s.state == "idle" else s
    if e.type == "capture-stopped":
        return INITIAL
    if e.type == "window-scored":
        if e.smoothed is None:
            msg = "window-scored needs a smoothed value"
            raise ValueError(msg)
        return s if s.state == "idle" else _scored(s, e.smoothed, e.at, cfg)
    if e.type == "silence":
        if s.state in ("idle", "possession", "exorcised"):
            return s
        quiet = s.last_voiced_at is None or e.at - s.last_voiced_at >= cfg.silence_ms
        return replace(s, state="listening") if quiet and s.state != "listening" else s
    if s.state == "possession":
        return replace(s, state="exorcised", above_count=0, below_count=0)
    return s


def replay(scores: Sequence[float], cfg: HauntingConfig, hop_ms: float = 1000.0) -> list[State]:
    """States after each window of one capture, every window treated as voiced."""
    smoother = Smoother(cfg.alpha)
    s = transition(INITIAL, Event("capture-started", 0.0), cfg)
    states: list[State] = []
    for i, score in enumerate(scores):
        s = transition(s, Event("window-scored", (i + 1) * hop_ms, smoother.next(score)), cfg)
        states.append(s.state)
    return states
