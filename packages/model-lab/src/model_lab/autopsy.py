"""Autopsy report: the same report as the browser (autopsy-mode, local-runtime Req. 4.3).

Shared by the Pro engine and the MCP server through `model_lab.inference` (P36).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from doppelganger_contracts.generated.autopsy_report_schema import AutopsyReport
from model_lab.haunting import INITIAL, Event, HauntingConfig, transition

if TYPE_CHECKING:
    from model_lab.pipeline import Audio, StreamSession

MIN_SCORED_WINDOWS: Final = 3
SAMPLE_RATE: Final = 16_000


def derive_verdict(windows: list[dict[str, object]], cfg: HauntingConfig) -> dict[str, object]:
    """Port of `deriveVerdict`: replays the haunting machine over the windows."""
    s = transition(INITIAL, Event("capture-started", 0.0), cfg)
    reached_possession = False
    reached_unease = False
    states: list[dict[str, object]] = []
    for w in windows:
        start, end = float(w["startS"]), float(w["endS"])  # type: ignore[arg-type]
        score, smoothed = w["score"], w["smoothed"]
        if score is not None and isinstance(smoothed, float):
            event = Event("window-scored", start * 1000.0, smoothed)
        else:
            event = Event("silence", start * 1000.0)
        s = transition(s, event, cfg)
        reached_possession = reached_possession or s.state == "possession"
        reached_unease = reached_unease or s.state == "unease"
        last = states[-1] if states else None
        if last is not None and last["state"] == s.state and float(last["to"]) >= start:  # type: ignore[arg-type]
            last["to"] = end
        else:
            states.append({"from": start, "to": end, "state": s.state})
    scored = sum(1 for w in windows if w["score"] is not None)
    if scored < MIN_SCORED_WINDOWS:
        verdict, reason = "inconclusive", "Not enough speech"
    elif reached_possession:
        verdict, reason = "likely-synthetic", "Dissonance reached Possession"
    elif reached_unease:
        verdict, reason = "inconclusive", "Dissonance rose to Unease but never reached Possession"
    else:
        verdict, reason = "likely-human", "Dissonance stayed low"
    return {"states": states, "verdict": verdict, "verdictReason": reason}


def analyze(samples: Audio, session: StreamSession) -> AutopsyReport:
    """Score every window of a 16 kHz mono recording and build a schema-checked report."""
    manifest = session.manifest
    hop, size = manifest.hopSamples, manifest.windowSamples
    windows: list[dict[str, object]] = []
    for start in range(0, samples.shape[0], hop):
        for index, voiced, raw, smoothed in session.push(samples[start : start + hop]):
            begin = index * hop / SAMPLE_RATE
            windows.append(
                {
                    "index": index,
                    "startS": begin,
                    "endS": begin + size / SAMPLE_RATE,
                    "voiced": voiced,
                    "score": raw,
                    "smoothed": smoothed,
                }
            )
    session.close()
    report = {
        "modelId": manifest.id,
        "modelVersion": manifest.version,
        "durationS": samples.shape[0] / SAMPLE_RATE,
        "windows": windows,
        **derive_verdict(windows, HauntingConfig()),
    }
    return AutopsyReport.model_validate(report)
