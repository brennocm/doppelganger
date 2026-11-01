# bench-web

ONNX Runtime Web latency benchmark (detection-model Requirement 2.3). A Playwright test serves `page/` on `127.0.0.1`, loads a model and its manifest from `apps/web/public/models/`, checks the SHA-256, and runs 50 windows with single-thread WASM SIMD (as on GitHub Pages). It reports p50 and p95 per window and writes `packages/model-lab/reports/<date>/latency-web.json` (git-ignored), which `mise run model:eval -- --web-latency <file>` merges into the report.

It runs as part of the E2E step of `mise run check:all`.
