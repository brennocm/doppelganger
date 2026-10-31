# Design Document

## Overview

Audio flows from a `MediaStream` (tab or mic) or a decoded clip into an `AudioContext`, through an `AudioWorklet` that downmixes and resamples, then to a dedicated worker that runs the detector and ONNX Runtime Web. Only small `DetectorUpdate` messages come back to the main thread, which renders the UI.

## Architecture

```text
Main thread                                   AudioWorklet thread            Inference worker
───────────                                   ───────────────────            ────────────────
CaptureController
  ├─ TabSource (getDisplayMedia)  ─┐
  ├─ MicSource (getUserMedia)     ─┼─► MediaStreamSource ─► capture-processor ──(MessagePort, transfer)──► detector.push()
  └─ ReplaySource (decodeAudioData)┘   (or AudioBufferSource)  downmix + resample        │
                                                                                        ├─ OrtWebBackend.run()
UI ◄──────────────────────────────── DetectorUpdate (state, smoothed, at) ◄─────────────┘
```

A `MessageChannel` connects the worklet directly to the worker, so audio never passes through the main thread.

## Components and Interfaces

### Sources (`apps/web/src/features/capture/`)

```ts
export interface CaptureSource {
  kind: "tab" | "mic" | "replay";
  start(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  onEnded(cb: () => void): void;
}
```

- `TabSource`: `navigator.mediaDevices.getDisplayMedia({ audio: { suppressLocalAudioPlayback: false }, video: true, preferCurrentTab: false, selfBrowserSurface: "exclude", systemAudio: "include" })`. Chromium requires `video: true` for tab audio; the video track is stopped as soon as the stream arrives. Feature detection decides whether the option is shown.
- `MicSource`: `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`.
- `ReplaySource`: fetches the clip, `decodeAudioData`, plays through an `AudioBufferSourceNode` connected to both the worklet and the speakers, so the viewer hears what is being judged.

### Capture worklet (`capture-processor.ts`)

- Downmix: average of the channels.
- Resampling: a windowed-sinc polyphase resampler (32 taps) for common rates (44.1 kHz and 48 kHz → 16 kHz), with state carried across `process()` calls. Output is clipped to [−1, 1].
- Batching: accumulates 1,600 output samples, then posts `Float32Array` buffers as transferables.

### Inference worker (`inference.worker.ts`)

- Imports `onnxruntime-web` with `ort.env.wasm.wasmPaths = "<base>/ort/"`, `ort.env.wasm.simd = true`, `ort.env.wasm.numThreads = crossOriginIsolated ? 2 : 1`.
- `OrtWebBackend` implements `InferenceBackend` from `packages/detector`.
- Model integrity: `crypto.subtle.digest("SHA-256", bytes)` compared with `manifest.sha256` before `InferenceSession.create(bytes)`.
- Posts `{ type: "update", update }`, `{ type: "perf", p50, p95 }`, `{ type: "error", code }`.

### Service worker

Precache list generated at build time (Vite plugin, hashed file names). Cache-first for hashed assets, network-first for `index.html`. The fetch handler ignores everything that is not same-origin `GET`.

## Data Models

Worker messages are discriminated unions defined in `packages/contracts` (`WorkerInbound`, `WorkerOutbound`).

## Correctness Properties

### Property 1: Resampler output length

*For any* input of n samples at a source rate in {22050, 44100, 48000, 96000}, processed in any chunking, the resampler outputs `round(n × 16000 / rate)` samples, ±1.

**Validates: Requirements 3.3**

### Property 2: Resampler output range

*For any* input with values in [−1, 1], every output sample is in [−1, 1].

**Validates: Requirements 3.3**

### Property 3: Downmix preserves identical channels

*For any* multi-channel buffer whose channels are identical, the downmixed signal equals that channel.

**Validates: Requirements 3.1**

### Property 4: Integrity check

*For any* model bytes and manifest, loading succeeds only if the SHA-256 of the bytes equals `manifest.sha256`.

**Validates: Requirements 4.2**

### Property 5: Main thread never receives audio

*For any* sequence of worker messages produced during a session, no message contains a `Float32Array`, `ArrayBuffer` or `AudioBuffer`.

**Validates: Requirements 4.4**

## Error Handling

| Condition | Message to the user |
| --- | --- |
| Tab shared without audio | "That tab was shared without its audio. Share it again and turn on 'Share tab audio'." |
| Permission denied | "Doppelgänger can't hear the call without permission. You can allow it in the address bar, or try a replay." |
| Model hash mismatch | "The detection model failed its integrity check, so it wasn't loaded. Reload the page; if this repeats, the files were altered." |
| WASM unsupported | "This browser can't run the detector. Use a recent Chrome, Edge or Firefox." |

## Testing Strategy

- fast-check property tests for Properties 1 to 5 (the resampler and downmix are pure functions extracted from the worklet).
- Vitest integration test: a fake source feeds a fixture through worklet logic and the worker with a fake backend.
- Playwright: Chromium with `--use-fake-ui-for-media-stream` and `--use-file-for-fake-audio-capture` drives the mic path end to end; the replay path is tested with bundled clips.
