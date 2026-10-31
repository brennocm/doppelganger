---
inclusion: always
---

# Tech stack and commands

## Stack

| Area | Choice | Why |
| --- | --- | --- |
| Toolchain and commands | `mise` (`.mise.toml`) | One pinned toolchain and the same command verbs everywhere |
| Web app and landing | TypeScript (strict), Vite, no UI framework | Small dependency surface, strict CSP, full control of the render loop |
| In-browser inference | `onnxruntime-web` (WASM, SIMD) inside a Web Worker | Runs on modest laptops; audio stays in the browser |
| Audio | Web Audio API, `AudioWorklet`, `getDisplayMedia` (tab audio), `getUserMedia` (mic, testing only) | Capture the remote side of a call without native code |
| Floating widget | Document Picture-in-Picture API (Chromium), with a compact-mode fallback | An always-on-top widget without a desktop app |
| Shared logic | `packages/detector` (pure TypeScript, no DOM) | Testable windowing, scoring, smoothing and state machine |
| Contracts | JSON Schema in `packages/contracts`, generating TS types and Pydantic models | One source of truth across languages |
| Model lab | Python 3.12, `uv`, PyTorch (export only), `onnx`, `onnxruntime` | Evaluate, calibrate, export and quantize models |
| Pro engine | Python 3.12, FastAPI, Uvicorn, `onnxruntime` (CPU) | Heavier model and Autopsy on localhost |
| Custom MCP server | Python, official MCP SDK, stdio transport | Lets Kiro analyze audio files with the project's own detector |
| Tests (TS) | Vitest, `fast-check` (property-based), Playwright (E2E and visual) | |
| Tests (Python) | pytest, Hypothesis (property-based) | |
| Lint and format | Biome (TS), Ruff (Python), ShellCheck (shell) | One formatter and one linter per language |
| Container | Multi-stage Dockerfile, non-root, base image pinned by digest | |
| CI and hosting | GitHub Actions (actions pinned by SHA), GitHub Pages | |
| Secret scanning | gitleaks (pre-commit and CI) | |

## Command interface

Always use these verbs. Never invent new entry points.

| Command | Meaning |
| --- | --- |
| `mise run check` | Definition of done: format check, lint, typecheck, unit and property tests for affected code |
| `mise run check:all` | Everything plus builds, E2E, license and dependency audit (CI runs this) |
| `mise run fix` | Every auto-fix |
| `mise run dev` | Web app and landing dev servers |
| `mise run dev:engine` | Pro engine via Docker Compose |
| `mise run test` | Tests; accepts a target, for example `mise run test -- packages/detector` |
| `mise run gen:contracts` | Regenerate TS and Python types from JSON Schema |
| `mise run model:eval` | Run the model evaluation harness |
| `mise run model:export` | Export, quantize and verify ONNX models; update the manifest |
| `mise run build:pages` | Build landing (`/`) and app (`/app/`) into one Pages artifact |

## Technical rules

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without a why-comment.
- Python: full type hints, Ruff strict rule set, `mypy --strict` on `apps/engine` and `packages/model-lab`.
- Audio inside the app is always **16 kHz, mono, Float32 in [-1, 1]**. Resampling happens once, at capture.
- Window and hop sizes come from the **model manifest**, never hard-coded.
- ONNX Runtime Web WASM files are **self-hosted** (`ort.env.wasm.wasmPaths`), never loaded from a CDN.
- GitHub Pages cannot set COOP/COEP headers, so WASM threads are unavailable there: use `numThreads = 1` with SIMD. Self-hosted mode may enable threads when cross-origin isolated.
- Unit tests are deterministic: no network, no real clock, no real microphone. Use injected clocks and fixture audio.
- Every new dependency is justified in the PR (what it does, size, license, maintenance health).
- Pin versions; commit lockfiles (`pnpm-lock.yaml`, `uv.lock`).
