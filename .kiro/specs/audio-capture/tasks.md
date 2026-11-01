# Implementation Plan

- [x] 1. Audio processing primitives
  - [x] 1.1 Implement pure `downmix` and the polyphase resampler with carried state
    - _Requirements: 3.1, 3.3_
  - [x]* 1.2 Write property test for resampler output length
    - **Property 1: Resampler output length**
    - **Validates: Requirements 3.3**
  - [x]* 1.3 Write property test for resampler output range
    - **Property 2: Resampler output range**
    - **Validates: Requirements 3.3**
  - [x]* 1.4 Write property test for downmix
    - **Property 3: Downmix preserves identical channels**
    - **Validates: Requirements 3.1**
  - [x] 1.5 Implement `capture-processor.ts` (AudioWorklet) using the primitives, posting 1,600-sample transferable chunks
    - _Requirements: 3.2, 3.4_

- [x] 2. Inference worker
  - [x] 2.1 Self-host ONNX Runtime Web files and configure the WASM paths, SIMD and thread count
    - _Requirements: 4.1_
  - [x] 2.2 Implement manifest and model loading with SHA-256 verification
    - _Requirements: 4.2_
  - [x]* 2.3 Write property test for the integrity check
    - **Property 4: Integrity check**
    - **Validates: Requirements 4.2**
  - [x] 2.4 Implement `OrtWebBackend` and wire `createDetector` inside the worker; report perf stats
    - _Requirements: 4.3_
  - [x]* 2.5 Write property test that the main thread never receives audio
    - **Property 5: Main thread never receives audio**
    - **Validates: Requirements 4.4**

- [x] 3. Capture sources
  - [x] 3.1 Implement `TabSource` with feature detection, video-track stop and end handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 3.2 Implement `MicSource` with processing disabled
    - _Requirements: 2.1_
  - [x] 3.3 Implement `ReplaySource` reading `clips.json`, with visible replay labelling
    - _Requirements: 2.2, 2.3_
  - [x] 3.4 Implement `CaptureController` connecting the worklet and the worker through a `MessageChannel`
    - _Requirements: 3.2, 4.4_

- [x] 4. Permissions and messaging
  - [x] 4.1 Implement the pre-permission privacy notice, denial guidance and the persistent listening indicator
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 4.2 Implement the error messages from the design
    - _Requirements: 1.2, 4.2_

- [ ] 5. Offline
  - [x] 5.1 Add the service worker with a build-time precache list and the same-origin GET-only fetch handler
    - _Requirements: 6.1, 6.3_
  - [ ] 5.2 Playwright test: load once, go offline, reload, run replay detection
    - _Requirements: 6.2_

- [ ] 6. End-to-end
  - [ ] 6.1 Playwright test of the mic path with a fake audio file and of the replay path with both clip labels
    - _Requirements: 2.1, 2.2_
  - [ ] 6.2 Manual test of tab capture with a real web call in Chrome on the reference laptop; record latency in the journal
    - _Requirements: 1.1, 4.3_
