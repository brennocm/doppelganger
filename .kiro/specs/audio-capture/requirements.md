# Requirements Document

## Introduction

This spec covers how the web app gets audio: the remote side of a call through browser tab capture, the microphone for quick testing, and bundled replay clips for a deterministic demo. It also covers resampling to 16 kHz mono and running inference in a Web Worker with ONNX Runtime Web. Audio stays in memory and never leaves the browser.

## Glossary

- **Capture_Source**: one of Tab (via `getDisplayMedia`), Microphone (via `getUserMedia`) or Replay (bundled clip).
- **Capture_Worklet**: the `AudioWorkletProcessor` that downmixes, resamples and forwards audio chunks.
- **Inference_Worker**: the dedicated Web Worker that hosts ONNX Runtime Web and the detector pipeline.
- **Replay_Clip**: a labelled demo recording listed in `apps/web/public/replay/clips.json`.

## Requirements

### Requirement 1: Tab capture

**User Story:** As a user on a web call, I want Doppelgänger to listen to the call tab, so that it analyzes the other person's voice and not mine.

#### Acceptance Criteria

1. WHEN the user chooses "Listen to a call tab", THE app SHALL request `getDisplayMedia` with audio enabled and SHALL guide the user to pick a tab and enable "Share tab audio".
2. WHEN the granted stream has no audio track, THE app SHALL stop the stream and explain how to share tab audio.
3. WHEN the granted stream has a video track, THE app SHALL stop the video track immediately and keep only audio.
4. WHEN the shared tab is closed or sharing stops, THE app SHALL stop capture and return to Idle.
5. WHERE the browser does not support tab audio capture, THE app SHALL hide the Tab option and explain which browsers support it.

### Requirement 2: Microphone and replay sources

**User Story:** As a judge, I want to try the detector without a call, so that I can see it work in seconds.

#### Acceptance Criteria

1. WHEN the user chooses "Use microphone", THE app SHALL request `getUserMedia` audio with echo cancellation, noise suppression and auto gain disabled.
2. WHEN the user chooses a Replay_Clip, THE app SHALL play it through the same pipeline and SHALL label the session "Replay: genuine" or "Replay: synthetic" from the clip metadata.
3. THE app SHALL label replay sessions visibly so they cannot be mistaken for live detection.

### Requirement 3: Audio processing

**User Story:** As the detector, I want a clean, uniform stream, so that model inputs match training conditions.

#### Acceptance Criteria

1. THE Capture_Worklet SHALL downmix to mono and resample from the context sample rate to 16 kHz.
2. THE Capture_Worklet SHALL post chunks of 100 ms (1,600 samples) to the Inference_Worker as transferable buffers.
3. THE resampler SHALL keep output values within [−1, 1] after clipping and SHALL produce `round(n × 16000 / sourceRate)` samples (±1) for an input of n samples.
4. THE app SHALL keep no audio after each window has been scored, beyond the Windower's buffer.

### Requirement 4: In-browser inference

**User Story:** As a user, I want inference that doesn't freeze the UI.

#### Acceptance Criteria

1. THE Inference_Worker SHALL load ONNX Runtime Web from self-hosted files with the WASM SIMD backend, using one thread unless the page is cross-origin isolated.
2. WHEN loading a model, THE Inference_Worker SHALL fetch the manifest and model from the same origin, verify the SHA-256 with Web Crypto, and refuse to load on mismatch.
3. THE Inference_Worker SHALL report its p95 inference time; WHEN p95 exceeds the hop duration, THE app SHALL show a "slow device" notice and rely on the detector's bounded queue.
4. THE main thread SHALL receive only `DetectorUpdate` messages, never audio.

### Requirement 5: Permissions and privacy messaging

**User Story:** As a user, I want to know exactly what happens with my audio before I grant access.

#### Acceptance Criteria

1. BEFORE requesting any permission, THE app SHALL show a short notice: audio is analyzed on this device, never recorded, never uploaded.
2. WHEN a permission is denied, THE app SHALL show how to grant it and SHALL offer Replay as an alternative.
3. WHILE capture is active, THE app SHALL show a persistent indicator with a "Stop listening" control.

### Requirement 6: Offline support

**User Story:** As a security-minded user, I want the app to work offline after the first visit.

#### Acceptance Criteria

1. THE app SHALL register a service worker that caches the app shell, ONNX Runtime files, the Light_Model and replay clips.
2. WHEN the network is unavailable after a successful first load, THE app SHALL start and run detection normally.
3. THE service worker SHALL cache only same-origin static assets and SHALL never cache captured audio.
