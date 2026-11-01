"""Entry point: `python -m doppelganger_engine` (local-runtime Requirements 1 and 2.1)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Final

import uvicorn

from doppelganger_engine import guards
from doppelganger_engine.app import Engine, create_app
from doppelganger_engine.config import ConfigError, load_settings
from doppelganger_engine.logs import JsonLog
from model_lab.inference import OnnxModel

WEB_DIR: Final = Path("/srv/web")
# SIGTERM: uvicorn closes open WebSockets and stops within this many seconds (Req. 1.5).
SHUTDOWN_TIMEOUT_S: Final = 4


def main() -> int:
    """Validate the environment, verify the model, print the launch URL and serve."""
    try:
        settings = load_settings(os.environ)
    except ConfigError as error:
        sys.stderr.write(f"doppelganger-engine: invalid configuration: {error}\n")
        return 2
    log = JsonLog(settings.log_level)
    try:
        model = OnnxModel.from_manifest_file(settings.manifest_path)
    except Exception:  # noqa: BLE001  (any failure to verify or load stops the engine)
        log.event("model_integrity_failed", level="error", modelId=settings.model_id)
        return 1
    token = guards.new_token()
    engine = Engine(model, token, settings.allowed_origin, log)
    app = create_app(engine, web_dir=WEB_DIR)
    # The only line that carries the token: the launch URL, printed once. The token is in
    # the fragment, so the browser never sends it to any server.
    sys.stdout.write(f"Doppelgänger engine ready: {settings.allowed_origin}/app/#token={token}\n")
    sys.stdout.flush()
    log.event("engine_started", modelId=model.manifest.id, port=settings.port)
    uvicorn.run(
        app,
        host="0.0.0.0",  # noqa: S104  (inside the container; Compose publishes 127.0.0.1 only)
        port=settings.port,
        log_config=None,
        access_log=False,
        timeout_graceful_shutdown=SHUTDOWN_TIMEOUT_S,
        ws="websockets",
        ws_max_size=64 * 1024,
        server_header=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
