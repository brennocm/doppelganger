# ruff: noqa: INP001  (standalone script, not part of a package)
"""One WebSocket session against a running engine container (local-runtime task 5.3, P43).

    uv run --locked python scripts/container_stream_check.py '<launch URL>'

Sends the hello with the session token from the launch URL fragment, waits for `ready`,
streams a seeded synthetic tone as PCM16 frames and requires at least one `score` for the
model. The audio is generated here and only ever sent to the loopback engine.
"""

from __future__ import annotations

import json
import sys
from urllib.parse import urlsplit

import numpy as np
from websockets.sync.client import connect
from websockets.typing import Origin

SAMPLE_RATE = 16_000
FRAME = 1_600  # 100 ms, as the web app sends
SECONDS = 6


def frames(seed: int = 0) -> list[bytes]:
    """A seeded 6 s tone with a little noise, as PCM16 little-endian frames."""
    rng = np.random.default_rng(seed)
    t = np.arange(SECONDS * SAMPLE_RATE) / SAMPLE_RATE
    signal = 0.3 * np.sin(2 * np.pi * 180.0 * t) + 0.02 * rng.standard_normal(t.shape[0])
    pcm = np.clip(np.floor(signal * 32768.0 + 0.5), -32768, 32767).astype("<i2")
    return [pcm[i : i + FRAME].tobytes() for i in range(0, pcm.shape[0], FRAME)]


def main(launch_url: str) -> int:
    """Run the session; 0 when a score arrives, 1 otherwise."""
    parts = urlsplit(launch_url)
    token = parts.fragment.removeprefix("token=")
    if parts.scheme != "http" or parts.hostname != "127.0.0.1" or not token:
        sys.stderr.write("container_stream_check: expected http://127.0.0.1:<port>/app/#token=…\n")
        return 1
    origin = f"http://127.0.0.1:{parts.port}"
    url = f"ws://127.0.0.1:{parts.port}/v1/stream"
    with connect(url, origin=Origin(origin), open_timeout=10) as ws:
        ws.send(json.dumps({"type": "hello", "protocol": 1, "token": token, "sampleRate": 16000}))
        ready = json.loads(ws.recv(timeout=10))
        if ready.get("type") != "ready":
            sys.stderr.write(f"container_stream_check: expected ready, got {ready.get('type')}\n")
            return 1
        for frame in frames():
            ws.send(frame)
        score = json.loads(ws.recv(timeout=30))
    ok = score.get("type") == "score" and score.get("modelId") == ready.get("modelId")
    sys.stdout.write(
        f"container_stream_check: {'ok' if ok else 'unexpected'} {score.get('type')}\n"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:  # noqa: PLR2004
        sys.stderr.write(__doc__ or "")
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
