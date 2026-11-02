# Requirements Document

## Introduction

This spec delivers tiers 2 and 3: the self-hosted static app and the optional Pro engine in Docker, plus `scripts/install.sh`, which sets them up on Linux and on Windows through WSL2. The engine serves the same web app from its own origin, so live streaming and Autopsy use same-origin requests guarded by an Origin check and a session token. The installer never installs system software and never needs `sudo`.

## Glossary

- **Engine**: the FastAPI service in `apps/engine`.
- **Static_Mode**: serving the built web app from `127.0.0.1` without Docker.
- **Engine_Mode**: running the Engine container, which serves the web app and the APIs.
- **Session_Token**: a random token generated at Engine start, required for WebSocket and Autopsy requests.
- **Installer**: `scripts/install.sh`.
- **Release_Bundle**: the GitHub Release assets: the built web app tarball, the Pro_Model, their manifests and `SHA256SUMS`.

## Requirements

### Requirement 1: Engine service contract

**User Story:** As a SecOps user, I want a predictable local service.

#### Acceptance Criteria

1. THE Engine SHALL read configuration only from environment variables validated at startup (`PORT`, `MODEL_DIR`, `MODEL_ID`, `ALLOWED_ORIGIN`, `LOG_LEVEL`) and SHALL exit with a clear message when one is invalid.
2. THE Engine SHALL expose `GET /healthz` returning status and the loaded model ID.
3. THE Engine SHALL serve the built web app at `/app/` with the same CSP as Pages, extended with security headers (`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) so that WASM threads are available.
4. THE Engine SHALL write structured JSON logs to stdout without audio, tokens or user file names.
5. WHEN it receives `SIGTERM`, THE Engine SHALL close open WebSockets and exit within 5 seconds.

### Requirement 2: Session token and origin checks

**User Story:** As a user, I want no other website to be able to use my local engine.

#### Acceptance Criteria

1. WHEN the Engine starts, THE Engine SHALL generate a Session_Token of at least 32 random bytes and print a launch URL containing it in the URL fragment.
2. WHEN the web app opens with a token in the fragment, THE app SHALL move it to `sessionStorage` and remove it from the address bar.
3. WHEN a WebSocket handshake arrives, THE Engine SHALL accept it only if `Origin` equals `ALLOWED_ORIGIN` exactly and the first message carries a valid Session_Token, compared in constant time.
4. WHEN an Autopsy request arrives, THE Engine SHALL require the Session_Token in an `Authorization: Bearer` header and an allowed `Origin`.
5. WHEN a check fails, THE Engine SHALL close or reject the request without revealing which check failed, and SHALL rate-limit repeated failures.

### Requirement 3: Live streaming endpoint

**User Story:** As a user in Engine_Mode, I want live calls scored by the Pro_Model.

#### Acceptance Criteria

1. THE Engine SHALL expose `WS /v1/stream`, accepting a `hello` text message (`protocol`, `token`, `sampleRate: 16000`) followed by binary frames of PCM16 little-endian mono audio.
2. THE Engine SHALL apply the same windowing, voice activity, scoring and smoothing as `packages/detector`, verified with the shared golden vectors.
3. THE Engine SHALL send `score` messages (`windowIndex`, `raw`, `smoothed`, `modelId`) and `error` messages defined in `packages/contracts`.
4. THE Engine SHALL hold at most one window plus one hop of audio per connection and SHALL drop it when the connection closes.
5. WHERE the web app is served by the Engine, THE web app SHALL be able to use the Engine as a score source for live detection: the Engine's `score` messages feed the Haunting_Machine directly, instead of a browser `InferenceBackend`. (Deferred: first in the cut order, decided 2026-11-01.)

### Requirement 4: Autopsy endpoint

**User Story:** As a SecOps user, I want file analysis with the heavier model.

#### Acceptance Criteria

1. THE Engine SHALL expose `POST /v1/autopsy` accepting one audio file of at most 20 MB and 5 minutes.
2. THE Engine SHALL reject larger requests from the `Content-Length` header and while streaming the body, before decoding.
3. THE Engine SHALL decode in memory only and SHALL return an `AutopsyReport`.

### Requirement 5: Container hardening

**User Story:** As a security reviewer, I want the container locked down by default.

#### Acceptance Criteria

1. THE Docker image SHALL be multi-stage (Node build of the web app, then a slim Python runtime with only `onnxruntime` and the engine), run as UID 10001, and pin base images by digest.
2. THE Compose file SHALL publish the port only on `127.0.0.1`, set `read_only: true`, mount `/tmp` as `tmpfs` with `noexec,nosuid`, drop all capabilities, set `no-new-privileges`, and set memory and CPU limits.
3. THE Compose file SHALL mount the model directory read-only.
4. THE image SHALL contain no compilers, shells beyond what the base image requires, or development dependencies.

### Requirement 6: Installer

**User Story:** As a user on Linux or WSL2, I want one command to run Doppelgänger locally.

#### Acceptance Criteria

1. THE Installer SHALL be POSIX `sh`, pass ShellCheck, and support Linux and WSL2; macOS SHALL be documented as untested.
2. THE Installer SHALL never call `sudo`, never install system packages, and never modify files outside the project directory and its own data directory (`${XDG_DATA_HOME:-$HOME/.local/share}/doppelganger`).
3. WHEN run without options, THE Installer SHALL check prerequisites (Docker, Compose v2, a free port, disk space, `sha256sum`), and for each missing one print what is missing and a link to official install instructions, then exit non-zero.
4. WHEN prerequisites pass, THE Installer SHALL download the Release_Bundle for the pinned version, verify every file against `SHA256SUMS`, start Engine_Mode with Compose, wait for `/healthz`, and print the launch URL.
5. WHEN run with `--static`, THE Installer SHALL require only `python3`, verify and unpack the web app, and serve it on `127.0.0.1` with `python3 -m http.server --bind 127.0.0.1`.
6. THE Installer SHALL support `--stop`, `--status` and `--uninstall` (which removes containers, images built by it and its data directory after confirmation).
7. WHEN any checksum fails, THE Installer SHALL delete the downloaded files and exit with an integrity error.
8. THE Installer SHALL be idempotent: running it twice leaves one running instance.
