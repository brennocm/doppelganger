import io
import json
import struct
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from doppelganger_contracts.generated.autopsy_report_schema import AutopsyReport
from doppelganger_engine import guards
from doppelganger_engine.app import HEADER_CSP, Engine, create_app
from doppelganger_engine.logs import JsonLog
from doppelganger_engine.pipeline import encode_pcm16
from model_lab.inference import OnnxModel

REPO = Path(__file__).resolve().parents[3]
MODEL = OnnxModel.from_manifest_file(REPO / "apps/web/public/models/ci-synthetic-linear.json")
ORIGIN = "http://127.0.0.1:8787"
OK, BAD_HOST, TOO_LARGE, UNSUPPORTED = 200, 400, 413, 415
POLICY_VIOLATION = 1008
TOKEN = "t" * 43


@pytest.fixture
def setup(tmp_path: Path) -> tuple[TestClient, io.StringIO]:
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>app</title>", encoding="utf-8")
    logs = io.StringIO()
    engine = Engine(MODEL, TOKEN, ORIGIN, JsonLog("debug", logs))
    return TestClient(create_app(engine, web_dir=web), base_url=ORIGIN), logs


def voiced(seconds: float, rate: int = 16000) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    return (0.3 * np.sin(2 * np.pi * 150 * t)).astype(np.float32)


def wav(samples: np.ndarray, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(encode_pcm16(samples).astype("<i2").tobytes())
    return buf.getvalue()


def test_healthz_and_security_headers(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    health = client.get("/healthz")
    assert health.json() == {"status": "ok", "modelId": "ci-synthetic-linear", "formats": ["wav"]}
    page = client.get("/app/")
    assert page.status_code == OK
    assert page.headers["content-security-policy"] == HEADER_CSP
    assert "frame-ancestors 'none'" in HEADER_CSP
    assert page.headers["cross-origin-opener-policy"] == "same-origin"
    assert page.headers["cross-origin-embedder-policy"] == "require-corp"
    assert page.headers["referrer-policy"] == "no-referrer"
    assert page.headers["x-content-type-options"] == "nosniff"


def test_stream_rejects_a_foreign_origin_before_accepting(
    setup: tuple[TestClient, io.StringIO],
) -> None:
    client, _ = setup
    with (
        pytest.raises(WebSocketDisconnect) as closed,
        client.websocket_connect(
            "ws://127.0.0.1:8787/v1/stream", headers={"origin": "https://evil.example"}
        ),
    ):
        pass
    assert closed.value.code == POLICY_VIOLATION


@pytest.mark.parametrize(
    "hello",
    [
        {"type": "hello", "protocol": 1, "token": "wrong", "sampleRate": 16000},
        {"type": "hello", "protocol": 1, "token": TOKEN, "sampleRate": 48000},
        {"type": "hello", "protocol": 2, "token": TOKEN, "sampleRate": 16000},
        "not json",
    ],
)
def test_stream_rejects_a_bad_hello_without_saying_why(
    setup: tuple[TestClient, io.StringIO], hello: object
) -> None:
    client, _ = setup
    with client.websocket_connect(
        "ws://127.0.0.1:8787/v1/stream", headers={"origin": ORIGIN}
    ) as ws:
        ws.send_text(hello if isinstance(hello, str) else json.dumps(hello))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == POLICY_VIOLATION


def test_stream_scores_pcm16_frames(setup: tuple[TestClient, io.StringIO]) -> None:
    client, logs = setup
    with client.websocket_connect(
        "ws://127.0.0.1:8787/v1/stream", headers={"origin": ORIGIN}
    ) as ws:
        ws.send_text(
            json.dumps({"type": "hello", "protocol": 1, "token": TOKEN, "sampleRate": 16000})
        )
        ready = ws.receive_json()
        assert ready == {
            "type": "ready",
            "modelId": "ci-synthetic-linear",
            "windowSamples": 64600,
            "hopSamples": 16000,
        }
        pcm = encode_pcm16(voiced(5.1)).astype("<i2").tobytes()
        for at in range(0, len(pcm), 3200):
            ws.send_bytes(pcm[at : at + 3200])
        first = ws.receive_json()
        second = ws.receive_json()
        assert [first["windowIndex"], second["windowIndex"]] == [0, 1]
        assert 0.0 <= first["raw"] <= 1.0
        ws.send_bytes(b"\x01")
        assert ws.receive_json() == {"type": "error", "code": "bad-frame"}
    assert TOKEN not in logs.getvalue()


def headers(**extra: str) -> dict[str, str]:
    return {"origin": ORIGIN, "authorization": f"Bearer {TOKEN}", **extra}


def test_autopsy_returns_the_shared_report(setup: tuple[TestClient, io.StringIO]) -> None:
    client, logs = setup
    response = client.post("/v1/autopsy", content=wav(voiced(8.0)), headers=headers())
    assert response.status_code == OK
    report = AutopsyReport.model_validate(response.json())
    assert report.modelId == "ci-synthetic-linear"
    assert len(report.windows) == (8 * 16000 - 64600) // 16000 + 1
    assert "voice" not in logs.getvalue()


@pytest.mark.parametrize(
    "bad",
    [
        {"origin": "https://evil.example", "authorization": f"Bearer {TOKEN}"},
        {"origin": ORIGIN, "authorization": "Bearer nope"},
        {"origin": ORIGIN},
        {"authorization": f"Bearer {TOKEN}"},
    ],
)
def test_autopsy_refuses_bad_origin_or_token_with_one_answer(
    setup: tuple[TestClient, io.StringIO], bad: dict[str, str]
) -> None:
    client, _ = setup
    response = client.post("/v1/autopsy", content=b"RIFF", headers=bad)
    assert (response.status_code, response.json()) == (403, {"error": "forbidden"})


def test_autopsy_size_and_format_limits(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    big = client.post(
        "/v1/autopsy",
        content=b"x",
        headers=headers(**{"content-length": str(guards.MAX_UPLOAD_BYTES + 1)}),
    )
    assert big.status_code == TOO_LARGE
    other = client.post("/v1/autopsy", content=b"ID3" + b"\0" * 64, headers=headers())
    assert other.status_code == UNSUPPORTED
    assert other.json()["supported"] == ["wav"]
    long = client.post(
        "/v1/autopsy",
        content=wav(np.zeros(301 * 8000, dtype=np.float32), rate=8000),
        headers=headers(),
    )
    assert long.status_code == TOO_LARGE


def test_repeated_failures_are_rate_limited(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    codes = [
        client.post("/v1/autopsy", content=b"", headers={"origin": ORIGIN}).status_code
        for _ in range(12)
    ]
    assert codes[:10] == [403] * 10
    assert codes[10:] == [429, 429]


def test_other_host_names_are_refused(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    assert client.get("/healthz", headers={"host": "rebind.example:8787"}).status_code == BAD_HOST


def header_only_wav(rate: int, data_bytes: int, bits: int = 8, channels: int = 1) -> bytes:
    align = channels * (bits // 8)
    fmt = struct.pack("<HHIIHH", 1, channels, rate, rate * max(align, 1), align, bits)
    body = b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", data_bytes)
    return b"RIFF" + struct.pack("<I", len(body) + data_bytes) + body + b"\x80" * data_bytes


def test_a_long_low_rate_file_is_refused_from_its_header(
    setup: tuple[TestClient, io.StringIO],
) -> None:
    client, _ = setup
    # 1 kHz, 8-bit: 19 MB of data is over 5 hours. Refused before decoding (exorcist H1).
    response = client.post(
        "/v1/autopsy", content=header_only_wav(1000, 19 * 1024 * 1024), headers=headers()
    )
    assert response.status_code == TOO_LARGE
    assert response.json()["error"] == "too-long"


def test_a_wav_with_odd_bit_depth_is_unsupported(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    response = client.post(
        "/v1/autopsy", content=header_only_wav(16000, 64, bits=4), headers=headers()
    )
    assert response.status_code == UNSUPPORTED


@pytest.mark.parametrize(
    "hello",
    [
        '{"type":"hello","protocol":1,"sampleRate":16000,"token":"\\ud800"}',
        "[" * 30000 + "]" * 30000,
    ],
)
def test_malformed_hellos_close_with_the_generic_code(
    setup: tuple[TestClient, io.StringIO], hello: str
) -> None:
    client, _ = setup
    with client.websocket_connect(
        "ws://127.0.0.1:8787/v1/stream", headers={"origin": ORIGIN}
    ) as ws:
        ws.send_text(hello)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == POLICY_VIOLATION


def test_another_website_cannot_lock_the_user_out(setup: tuple[TestClient, io.StringIO]) -> None:
    client, _ = setup
    for _ in range(30):
        client.post("/v1/autopsy", content=b"", headers={"origin": "https://evil.example"})
    ok = client.post("/v1/autopsy", content=wav(voiced(5.0)), headers=headers())
    assert ok.status_code == OK
