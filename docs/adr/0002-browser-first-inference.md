# 0002 — Browser-first inference

- Status: accepted
- Date: 2026-10-30
- Related: `audio-capture`, `detection-model`, `detection-core`, security steering

## Context

Doppelgänger listens to the remote side of a call and scores it for signs of a synthetic voice. The audio is personal, often confidential, and sometimes legally protected. The product promise is "local by construction": no audio, transcript or score leaves the device. Judges and first-time users must also be able to try it with one click, without installing anything.

## Decision

Inference runs in the user's browser by default:

- The light model is an ONNX file served from the same origin and verified against the SHA-256 in its model manifest before loading.
- `onnxruntime-web` (WASM with SIMD) runs inside a dedicated Web Worker. Its WASM files are self-hosted, never loaded from a CDN.
- On GitHub Pages, cross-origin isolation is unavailable (no COOP/COEP headers), so `numThreads = 1`. Self-hosted mode may enable threads when the page is cross-origin isolated.
- Audio is captured with `getDisplayMedia` (tab audio) and resampled once, at capture, to 16 kHz mono Float32.
- The strict CSP (`connect-src 'self'`) makes it impossible for the page to send audio to another origin, even by mistake.

Heavier models run only in the optional Pro engine on localhost (ADR 0003), never on a remote server.

## Alternatives considered

- **Cloud inference API.** Rejected: it would send call audio to a third party, which breaks the core promise, adds a secret to manage, and needs a server to run and pay for.
- **Native desktop app or call-platform plugin.** Rejected: listed as a non-goal in the product steering. It also means per-platform builds and an install step before anyone can try it.
- **WebGPU inference.** Not chosen as the default: availability varies across browsers and machines, and the reference machine has no discrete GPU. It can be reconsidered later as an optional backend if measurements justify it; that would need a new ADR.
- **Server-side processing over WebRTC.** Rejected for the same reasons as a cloud API.

## Consequences

- The light model must stay small and fast enough for a modest laptop. The `detection-model` spec sets the limits (file size ≤ 10 MB) and measures latency for single-thread ORT Web. No performance figures are claimed until that evaluation runs.
- Detection quality in the browser is bounded by what a small model can do. The model card documents this limit.
- Privacy holds even for the hosted demo, because the host only serves static files.
