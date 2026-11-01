# Design Document

## Overview

The Engine is a small FastAPI app that (a) serves the built web app, (b) streams live scores over a WebSocket and (c) analyzes files. Because the web app and the APIs share one origin (`http://127.0.0.1:8787`), no CORS is needed. The Origin allowlist and the Session_Token protect against cross-site WebSocket hijacking and drive-by requests from other sites.

## Architecture

```text
Browser (http://127.0.0.1:8787/app/#token=…)
   │  same origin
   ▼
Docker (published 127.0.0.1:8787 → container 0.0.0.0:8787)
 └─ engine (UID 10001, read-only fs, no caps)
     ├── StaticFiles /app/  (web build + headers middleware)
     ├── GET  /healthz
     ├── WS   /v1/stream    → OriginGuard → TokenGuard → StreamSession → model_lab.inference
     └── POST /v1/autopsy   → OriginGuard → TokenGuard → SizeGuard → decode (memory) → AutopsyRunner
                                                         │
                                  /models (read-only volume: pro model + manifest)
```

## Components and Interfaces

### Configuration (`apps/engine/src/engine/config.py`)

Pydantic Settings: `PORT=8787`, `MODEL_DIR=/models`, `MODEL_ID`, `ALLOWED_ORIGIN=http://127.0.0.1:8787`, `LOG_LEVEL=info`. On startup, the model hash is verified against the manifest; on failure the engine exits non-zero.

### Guards

- `OriginGuard`: exact string match of `Origin` with `ALLOWED_ORIGIN`; missing `Origin` is rejected.
- `TokenGuard`: `hmac.compare_digest` against the token generated with `secrets.token_urlsafe(32)` at startup and printed once to stdout as the launch URL.
- Failure responses: WebSocket close code 1008 or HTTP 403 with a generic body. A token bucket of 10 failures per minute per client returns 429 after that.
- `SizeGuard`: checks `Content-Length` ≤ 20 MB, then counts bytes while streaming the body into a `bytearray` and aborts past the limit.

### Stream session

```text
client                                  engine
hello {protocol:1, token, sampleRate}  → validate
                                       ← ready {modelId, windowSamples, hopSamples}
binary PCM16LE (1600 samples / 100 ms) → ring buffer (window + hop) → windows → score/smooth
                                       ← score {windowIndex, raw, smoothed, modelId}
```

PCM16 decoding: `int16 / 32768.0`. The ring buffer is a preallocated NumPy array per connection.

### Decoding

`soundfile` (libsndfile) reads from `io.BytesIO`. Ogg Opus support depends on the libsndfile version in the image; this is checked in a build-time test, and the supported formats are reported by `/healthz`.

**P29 (replaces the paragraph above):** `soundfile` ships libsndfile, which is LGPL-2.1, and LGPL is outside the license allowlist (project-foundation Requirement 4.4). So the engine decodes WAV only, with the standard library `wave` module and NumPy, in memory: PCM 8/16/24/32-bit and 32-bit float, any channel count and any rate, then downmixed and resampled to 16 kHz. Any other format gets 415 with `supported: ["wav"]`, which `/healthz` also reports. The browser Autopsy still reads every format the browser can decode. To widen the engine's formats later, add an allowlisted decoder or accept LGPL; that is the developer's decision.

### Implementation details (P29)

- **Configuration** is a Pydantic `BaseModel` built from `os.environ`, not `pydantic-settings`, which would add a dependency for five variables. The Python package keeps its existing name, `doppelganger_engine`.
- **Pipeline parity.** The stream session uses ports of the detector's windowing, voice activity check and resampler (`doppelganger_engine.pipeline`, `doppelganger_engine.resample`). Scoring, the smoother and `transition` come from `model_lab.inference`, which re-exports the `model_lab.haunting` primitives so that the engine imports model-lab only through its published inference module (structure steering). An import-linter contract enforces this. `packages/contracts/fixtures/golden/stream.json`, written by the TS tests from `createDetector` with a fake single-logit model (logit = 40 × window mean), holds a PCM16 signal and the raw score per window; the engine test must match it to 1e-9 (Property 5). `pcm16.json` holds encode and decode vectors (Property 4). Encoding is `round(clamp(x) × 32768)` clamped to [−32768, 32767]; decoding is `n / 32768`.
- **Stream messages** are TS types in `packages/contracts/src/stream-messages.ts` plus matching Pydantic models in the engine, not JSON Schemas: `hello { type, protocol: 1, token, sampleRate: 16000 }`, `ready { type, modelId, windowSamples, hopSamples }`, `score { type, windowIndex, raw, smoothed, modelId }`, `error { type, code: "bad-hello" | "bad-frame" | "rate-limited" }`.
- **Rate limit.** A failed *token* check from the allowed Origin costs one token from a per-client bucket of 10 per minute. The client key is the peer address, so all local traffic shares one bucket. To stop another website from emptying the bucket and locking the user out, Origin failures are not charged (they are refused at once anyway), and a request with the valid token is never refused by the limiter. (exorcist M1)
- **Duration before decoding.** The WAV header gives frames = data bytes / block align. A file longer than 5 minutes is refused from that number, before any sample is converted or resampled, so a small low-rate file cannot expand into hours of audio in memory. (exorcist H1)
- **Hosts and framing.** Only `Host: 127.0.0.1` and `localhost` are served (DNS rebinding), and the header CSP adds `frame-ancestors 'none'`. Unhandled errors return a JSON 500 that still carries the security headers.
- **The token on stdout.** The launch URL is the one stdout line that carries the token. It is printed once, outside the JSON logs, because Requirement 2.1 needs it. Whoever can read container logs is in the `docker` group, which is root-equivalent. Log forwarding to a central collector would carry a live token until the engine restarts. (exorcist L6, accepted)
- **Tests without Docker.** The engine is tested in-process with FastAPI's `TestClient` and the synthetic CI model. The container test (task 5.3) needs Docker in CI.

### Compose (`infra/docker/compose.yaml`)

```yaml
services:
  engine:
    build: { context: ../.., dockerfile: infra/docker/Dockerfile }
    ports: ["127.0.0.1:${DOPPELGANGER_PORT:-8787}:8787"]
    read_only: true
    tmpfs: ["/tmp:rw,noexec,nosuid,size=64m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    user: "10001:10001"
    mem_limit: 2g
    cpus: 2
    volumes: ["${DOPPELGANGER_MODELS}:/models:ro"]
    environment: [MODEL_ID, ALLOWED_ORIGIN]
    restart: unless-stopped
```

### Installer flow

```text
install.sh [--static|--stop|--status|--uninstall] [--version X.Y.Z]
  ├─ detect platform (Linux, WSL2 via /proc/version, macOS = warn "untested")
  ├─ check prerequisites → print missing items with official links → exit 1
  ├─ download release assets to $DATA_DIR/<version>/ (curl -fsSL, or wget)
  ├─ sha256sum -c SHA256SUMS  (fail → delete files, exit 2)
  ├─ engine mode: docker compose -p doppelganger up -d --build; poll /healthz (60 s); print URL
  └─ static mode: unpack web; python3 -m http.server 8788 --bind 127.0.0.1 --directory …
```

The token in engine mode is read from the container's first log line with `docker compose logs`.

## Data Models

`StreamHello`, `StreamReady`, `StreamScore`, `StreamError`, `AutopsyReport`: all in `packages/contracts`, with Pydantic models generated from them.

## Correctness Properties

### Property 1: Origin guard

*For any* `Origin` header value (including missing, case variants, trailing slashes, other ports and `null`), the guard accepts the request only if the value equals `ALLOWED_ORIGIN` exactly.

**Validates: Requirements 2.3, 2.4**

### Property 2: Token guard

*For any* candidate token, the guard accepts if and only if it equals the session token; the comparison uses `hmac.compare_digest`.

**Validates: Requirements 2.3**

### Property 3: Size guard

*For any* body length and declared `Content-Length` (including missing or false), no more than the 20 MB limit plus one chunk is ever buffered, and bodies over the limit are rejected.

**Validates: Requirements 4.1, 4.2**

### Property 4: PCM16 round trip

*For any* Float32 samples in [−1, 1], encoding to PCM16 in the web app and decoding in the engine changes each sample by at most 1/32768 (golden vectors shared with TS).

**Validates: Requirements 3.1, 3.2**

### Property 5: Stream parity with the detector

*For any* signal, the engine's per-window raw scores with a fixed fake model equal those of `packages/detector` for the same model outputs.

**Validates: Requirements 3.2**

### Property 6: Bounded per-connection memory

*For any* sequence of binary frames, the per-connection buffer never exceeds `windowSamples + hopSamples` samples.

**Validates: Requirements 3.4**

## Error Handling

| Condition | Behavior |
| --- | --- |
| Model hash mismatch at start | Exit 1, log `model_integrity_failed` |
| Bad `hello` | Close 1008 |
| Frame not PCM16-aligned | Send `error {code: "bad-frame"}`, then close |
| Unsupported audio format | 415 with the supported list |
| Installer: Docker missing | "Docker isn't installed. Install it from https://docs.docker.com/engine/install/ (Linux) or enable Docker in WSL2, then run this again." |

## Testing Strategy

- Hypothesis tests for Properties 1 to 6 (FastAPI `TestClient` for guards and endpoints).
- A container test in CI: build the image, run Compose, hit `/healthz`, run a WebSocket session with a fixture, assert `docker inspect` shows read-only root, no capabilities and a non-root user.
- Installer: ShellCheck; Bats tests with stubbed `docker`, `curl` and `sha256sum` on `PATH` for each prerequisite failure, checksum failure, idempotency and `--uninstall`.
- Manual run on WSL2 on the reference laptop, recorded in the journal.
