"""The Pro engine (local-runtime): the web app, `/healthz`, `WS /v1/stream`, `POST /v1/autopsy`.

Everything is same-origin. Every WebSocket and Autopsy request passes the Origin check and
the Session_Token check; failures get one generic answer and are rate-limited per client.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Final, Protocol

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from doppelganger_engine import autopsy, guards
from doppelganger_engine.audio_file import SUPPORTED_FORMATS, UnsupportedAudioError, to_16k_mono
from doppelganger_engine.pipeline import Audio, BadFrameError, StreamSession

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from pathlib import Path

    import numpy as np

    from doppelganger_contracts.generated.model_manifest_schema import ModelManifest
    from doppelganger_engine.logs import JsonLog

CSP: Final = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; "
    "connect-src 'self'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; "
    "object-src 'none'; base-uri 'none'; form-action 'none'"
)
SECURITY_HEADERS: Final = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    # Cross-origin isolation, so ONNX Runtime Web may use WASM threads (Requirement 1.3).
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
}
SAMPLE_RATE: Final = 16_000
MAX_SECONDS: Final = 300
HELLO_TIMEOUT_S: Final = 5.0
POLICY_VIOLATION: Final = 1008
FORBIDDEN: Final = {"error": "forbidden"}
TOO_LARGE: Final = {"error": "too-large", "limitBytes": guards.MAX_UPLOAD_BYTES}


class Model(Protocol):
    """What the engine needs from a loaded model (model_lab.inference.OnnxModel)."""

    manifest: ModelManifest

    def logits(self, window: Audio) -> np.ndarray[Any, Any]:
        """Raw output for one window."""
        ...


@dataclass
class Engine:
    """One verified model, one session token, one allowed origin."""

    model: Model
    token: str
    allowed_origin: str
    log: JsonLog
    limiter: guards.FailureLimiter = field(default_factory=guards.FailureLimiter)

    @property
    def manifest(self) -> ModelManifest:
        """The loaded model's manifest."""
        return self.model.manifest

    def logits(self, window: Audio) -> list[float]:
        """Raw model output as floats."""
        return [float(v) for v in self.model.logits(window)]

    def session(self) -> StreamSession:
        """A fresh per-connection pipeline."""
        return StreamSession(self.manifest, self.logits)

    def valid_hello(self, hello: object) -> bool:
        """The first message: protocol 1, 16 kHz and the session token."""
        return (
            isinstance(hello, dict)
            and hello.get("type") == "hello"
            and hello.get("protocol") == 1
            and hello.get("sampleRate") == SAMPLE_RATE
            and guards.token_ok(hello.get("token"), self.token)
        )

    async def stream(self, ws: WebSocket) -> None:
        """WS /v1/stream: Origin before accept, token in the first message."""
        client = ws.client.host if ws.client else "unknown"
        if self.limiter.blocked(client) or not guards.origin_ok(
            ws.headers.get("origin"), self.allowed_origin
        ):
            self.limiter.fail(client)
            await ws.close(code=POLICY_VIOLATION)
            return
        await ws.accept()
        try:
            hello = json.loads(await asyncio.wait_for(ws.receive_text(), HELLO_TIMEOUT_S))
        except (TimeoutError, ValueError, KeyError, WebSocketDisconnect):
            hello = None
        if not self.valid_hello(hello):
            self.limiter.fail(client)
            await ws.close(code=POLICY_VIOLATION)
            return
        m = self.manifest
        await ws.send_json(
            {
                "type": "ready",
                "modelId": m.id,
                "windowSamples": m.windowSamples,
                "hopSamples": m.hopSamples,
            }
        )
        await self._stream_frames(ws, self.session())

    async def _stream_frames(self, ws: WebSocket, session: StreamSession) -> None:
        self.log.event("stream_opened", modelId=self.manifest.id)
        try:
            while True:
                message = await ws.receive()
                if message["type"] == "websocket.disconnect":
                    break
                frame = message.get("bytes")
                try:
                    scores = None if frame is None else await run_in_threadpool(session.feed, frame)
                except BadFrameError:
                    scores = None
                if scores is None:
                    await ws.send_json({"type": "error", "code": "bad-frame"})
                    await ws.close(code=POLICY_VIOLATION)
                    break
                for score in scores:
                    await ws.send_json(score)
        except WebSocketDisconnect:
            pass
        finally:
            # Drop this connection's audio (Requirement 3.4).
            session.close()
            self.log.event("stream_closed", modelId=self.manifest.id)

    def _refused(self, request: Request) -> Response | None:
        client = request.client.host if request.client else "unknown"
        if self.limiter.blocked(client):
            return JSONResponse({"error": "rate-limited"}, status_code=429)
        origin = guards.origin_ok(request.headers.get("origin"), self.allowed_origin)
        token = guards.token_ok(guards.bearer(request.headers.get("authorization")), self.token)
        if not (origin and token):
            self.limiter.fail(client)
            return JSONResponse(FORBIDDEN, status_code=403)
        return None

    async def autopsy(self, request: Request) -> Response:
        """POST /v1/autopsy: guards, size limits, in-memory decode, shared report."""
        refused = self._refused(request)
        if refused is not None:
            return refused
        if guards.declared_too_large(request.headers.get("content-length")):
            return JSONResponse(TOO_LARGE, status_code=413)
        try:
            body = await guards.read_limited(request.stream())
        except guards.TooLargeError:
            return JSONResponse(TOO_LARGE, status_code=413)
        try:
            samples = await run_in_threadpool(to_16k_mono, body)
        except UnsupportedAudioError:
            body_out = {"error": "unsupported-format", "supported": list(SUPPORTED_FORMATS)}
            return JSONResponse(body_out, status_code=415)
        finally:
            # The upload was only ever in memory; drop it as soon as it is decoded.
            del body
        if samples.shape[0] > MAX_SECONDS * SAMPLE_RATE:
            return JSONResponse({"error": "too-long", "limitSeconds": MAX_SECONDS}, 413)
        report = await run_in_threadpool(autopsy.analyze, samples, self.session())
        self.log.event("autopsy_done", modelId=self.manifest.id, windows=len(report.windows))
        return JSONResponse(report.model_dump(mode="json", by_alias=True))


def create_app(engine: Engine, web_dir: Path | None = None) -> FastAPI:
    """Wire the engine's routes, the security headers and the static web app."""
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response

    @app.get("/healthz")
    async def healthz() -> dict[str, object]:
        return {"status": "ok", "modelId": engine.manifest.id, "formats": list(SUPPORTED_FORMATS)}

    @app.get("/")
    async def root() -> RedirectResponse:
        return RedirectResponse("/app/")

    app.add_api_websocket_route("/v1/stream", engine.stream)
    app.add_api_route("/v1/autopsy", engine.autopsy, methods=["POST"])
    if web_dir is not None and web_dir.is_dir():
        app.mount("/app", StaticFiles(directory=web_dir, html=True), name="app")
    return app
