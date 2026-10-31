# 0003 — Delivery tiers

- Status: accepted
- Date: 2026-10-30
- Related: `project-foundation` (Pages pipeline), `local-runtime`, product and security steering

## Context

Different people need different levels of trust and capability. Judges want one public URL. Privacy-conscious users and SecOps teams may not want to load even a static app from a third-party host. Some users want a heavier model and offline analysis of recorded files (Autopsy mode), which is too much for a browser tab.

## Decision

Ship the same web app in three tiers:

1. **Demo (primary): GitHub Pages.** A static artifact (landing at `/`, app at `/app/`) built by `mise run build:pages` and deployed after CI passes on `main`. Inference runs in the browser (ADR 0002). Nothing needs to be installed.
2. **Self-hosted.** The same static build served from the user's own machine on `127.0.0.1` (`scripts/install.sh --static`, which needs only `python3`). It works offline. The base path is configurable (`PAGES_BASE`), so the same build works at `/`.
3. **Pro engine (optional).** A hardened Docker container (FastAPI) that serves the web app and adds a heavier model and Autopsy mode. Compose publishes it only on `127.0.0.1`. WebSocket and Autopsy requests need an exact `Origin` match and a random session token.

## Alternatives considered

- **Pages only.** Rejected: no answer for users who distrust the host, and no room for a heavier model or file analysis.
- **Docker only.** Rejected: judges and casual users would need Docker before seeing anything.
- **A public hosted engine.** Rejected: audio would leave the device (ADR 0002).
- **Electron or another desktop wrapper.** Rejected: a non-goal in the product steering. It also adds a large runtime to audit and update.

## Consequences

- One codebase and one build, with the base path and the inference backend chosen at runtime or build time.
- The Pages CSP is a meta tag, because Pages cannot set headers. The engine adds real security headers, including COOP and COEP so WASM threads become available.
- The engine is extra attack surface on the user's machine, so the security steering puts strict limits on it (localhost only, non-root, read-only filesystem, origin and token checks, upload limits).
