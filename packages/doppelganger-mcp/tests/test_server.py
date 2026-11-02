"""MCP tools through the SDK's in-memory client (kiro-workbench Requirement 7).

Test audio is a seeded synthetic signal written to a temporary folder at test time.
"""

import io
import wave
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from mcp import Client

from doppelganger_mcp import analysis, sandbox
from doppelganger_mcp.server import mcp

pytestmark = pytest.mark.anyio
CI_MODEL = "ci-synthetic-linear"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def wav_bytes(seconds: float, seed: int = 0, rate: int = 16_000) -> bytes:
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * rate)) / rate
    signal = 0.3 * np.sin(2 * np.pi * rng.uniform(120, 300) * t) + 0.05 * rng.standard_normal(
        t.shape[0]
    )
    pcm = np.clip(np.round(signal * 32767), -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm.tobytes())
    return buf.getvalue()


@pytest.fixture
def roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv(sandbox.ROOTS_ENV, str(tmp_path))
    monkeypatch.delenv(analysis.MODELS_ENV, raising=False)
    return tmp_path


async def call(name: str, args: dict[str, Any] | None = None) -> Any:  # noqa: ANN401
    async with Client(mcp) as client:
        return await client.call_tool(name, args or {})


async def test_the_three_tools_are_registered() -> None:
    async with Client(mcp) as client:
        names = {tool.name for tool in (await client.list_tools()).tools}
    assert names == {"analyze_audio_file", "list_models", "explain_thresholds"}


async def test_list_models_reports_hash_and_license() -> None:
    result = await call("list_models")
    assert not result.is_error
    models = result.structured_content["result"]
    ci = next(m for m in models if m["id"] == CI_MODEL)
    assert len(ci["sha256"]) == 64  # noqa: PLR2004
    assert set(ci["license"]) >= {"code", "weights", "trainingData"}
    assert ci["window_samples"] == 64_600  # noqa: PLR2004


async def test_explain_thresholds_matches_the_detector_defaults() -> None:
    result = await call("explain_thresholds")
    body = result.structured_content
    assert (body["unease"], body["possession"], body["release"]) == (0.4, 0.7, 0.5)
    assert body["confirm_windows"] == 3  # noqa: PLR2004
    assert "not proof" in body["explanation"]


async def test_analyze_scores_a_wav_inside_the_sandbox(roots: Path) -> None:
    clip = roots / "clip.wav"
    clip.write_bytes(wav_bytes(8.0, seed=1))
    result = await call("analyze_audio_file", {"path": str(clip)})
    assert not result.is_error, result.content
    body = result.structured_content
    assert body["model_id"] == CI_MODEL
    assert len(body["windows"]) == (8 * 16_000 - 64_600) // 16_000 + 1
    scores = [w["score"] for w in body["windows"] if w["score"] is not None]
    assert scores
    assert body["summary"]["peak"] == max(scores)
    assert body["summary"]["verdict"] in {"likely-human", "inconclusive", "likely-synthetic"}
    assert "docs/model-card.md" in body["note"]


@pytest.mark.parametrize(
    ("make", "message"),
    [
        (lambda root: root.parent / "outside.wav", "outside the allowed folders"),
        (lambda root: root / "missing.wav", "outside the allowed folders"),
        (lambda root: root / "note.ogg", "WAV files only"),
    ],
)
async def test_analyze_refusals_are_tool_errors(roots: Path, make: Any, message: str) -> None:  # noqa: ANN401
    (roots.parent / "outside.wav").write_bytes(wav_bytes(5.0))
    (roots / "note.ogg").write_bytes(b"OggS" + b"\0" * 64)
    result = await call("analyze_audio_file", {"path": str(make(roots))})
    assert result.is_error
    assert message in result.content[0].text


async def test_unknown_models_are_tool_errors(roots: Path) -> None:
    clip = roots / "clip.wav"
    clip.write_bytes(wav_bytes(5.0))
    result = await call("analyze_audio_file", {"path": str(clip), "model_id": "nope"})
    assert result.is_error
    assert CI_MODEL in result.content[0].text


def test_a_tampered_model_is_never_loaded(tmp_path: Path) -> None:
    repo_models = sandbox.REPO_ROOT / "apps/web/public/models"
    for name in ("ci-synthetic-linear.json", "ci-synthetic-linear.int8.onnx"):
        (tmp_path / name).write_bytes((repo_models / name).read_bytes())
    onnx = tmp_path / "ci-synthetic-linear.int8.onnx"
    onnx.write_bytes(onnx.read_bytes() + b"\0")
    with pytest.raises(analysis.AnalysisError, match="failed its integrity check"):
        analysis.load_model([tmp_path], None)
