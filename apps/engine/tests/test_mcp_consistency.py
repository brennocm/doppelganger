"""MCP output matches the engine's Autopsy (kiro-workbench Requirement 7.1, Property 2).

Lives with the engine because apps may import packages, never the other way round.
Audio is generated from seeds at test time and kept in memory.
"""

import io
import wave
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from doppelganger_engine.app import Engine, create_app
from doppelganger_engine.logs import JsonLog
from doppelganger_mcp import analysis
from model_lab.inference import OnnxModel

REPO = Path(__file__).resolve().parents[3]
MODEL = OnnxModel.from_manifest_file(REPO / "apps/web/public/models/ci-synthetic-linear.json")
ORIGIN = "http://127.0.0.1:8787"
TOKEN = "t" * 43


def _wav(samples: np.ndarray, rate: int, channels: int) -> bytes:
    pcm = np.clip(np.round(samples * 32767), -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(np.repeat(pcm, channels).tobytes())
    return buf.getvalue()


def _signal(seed: int, seconds: float, rate: int, kind: str) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * rate)
    t = np.arange(n) / rate
    match kind:
        case "tone":
            out = 0.4 * np.sin(2 * np.pi * rng.uniform(100, 400) * t)
        case "noise":
            out = rng.uniform(-0.5, 0.5, n)
        case "silence":
            out = np.zeros(n)
        case _:
            out = 0.4 * np.sin(2 * np.pi * rng.uniform(100, 400) * t) * (t % 2 < 1)
    return out


CLIENT = TestClient(
    create_app(Engine(MODEL, TOKEN, ORIGIN, JsonLog("error", io.StringIO())), web_dir=None),
    base_url=ORIGIN,
)


# Feature: kiro-workbench, Property 2: Output consistency with the engine
@settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    seed=st.integers(0, 2**32 - 1),
    seconds=st.sampled_from([0.5, 4.0375, 4.04, 5.0, 7.3]),
    rate=st.sampled_from([8_000, 16_000, 44_100, 48_000]),
    channels=st.sampled_from([1, 2]),
    kind=st.sampled_from(["tone", "noise", "silence", "bursts"]),
)
def test_mcp_scores_equal_the_engine_autopsy(
    seed: int, seconds: float, rate: int, channels: int, kind: str
) -> None:
    data = _wav(_signal(seed, seconds, rate, kind), rate, channels)
    response = CLIENT.post(
        "/v1/autopsy", content=data, headers={"origin": ORIGIN, "authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 200  # noqa: PLR2004
    engine = response.json()
    mcp = analysis.analyze_bytes(data, MODEL)
    assert mcp["model_id"] == engine["modelId"]
    assert len(mcp["windows"]) == len(engine["windows"])
    for ours, theirs in zip(mcp["windows"], engine["windows"], strict=True):  # type: ignore[call-overload]
        assert ours["start_s"] == theirs["startS"]
        assert (ours["score"] is None) == (theirs["score"] is None)
        if ours["score"] is not None:
            assert abs(ours["score"] - theirs["score"]) <= 1e-6  # noqa: PLR2004
    assert mcp["summary"]["verdict"] == engine["verdict"]  # type: ignore[index]
