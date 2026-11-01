# Implementation Plan

- [ ] 1. Contracts
  - [x] 1.1 Add JSON Schemas for `ModelManifest`, `DetectorUpdate`, `SessionStats` and the haunting config to `packages/contracts`; generate TS and Python types
    - _Requirements: 6.1, 7.1_
  - [x] 1.2 Add golden vector fixtures for windowing and calibration
    - _Requirements: 3.3_

- [x] 2. Windower
  - [x] 2.1 Implement `createWindower`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x]* 2.2 Write property test for window count
    - **Property 1: Window count**
    - **Validates: Requirements 1.1**
  - [x]* 2.3 Write property test for chunking invariance
    - **Property 2: Chunking invariance**
    - **Validates: Requirements 1.1, 1.2**
  - [x]* 2.4 Write property test for bounded memory
    - **Property 3: Bounded memory**
    - **Validates: Requirements 1.3**

- [ ] 3. Voice activity
  - [x] 3.1 Implement `isVoiced` with configurable thresholds and unit tests on silence, noise and speech fixtures
    - _Requirements: 2.1, 2.2_
  - [ ] 3.2 Add the optional neural VAD path through `InferenceBackend`
    - _Requirements: 2.3_

- [x] 4. Scorer and smoother
  - [x] 4.1 Implement `score` with manifest calibration; assert the golden vectors
    - _Requirements: 3.1, 3.2, 3.3_
  - [x]* 4.2 Write property test for score bounds and rejection
    - **Property 4: Score bounds and rejection**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 4.3 Implement `createSmoother`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 4.4 Write property test for smoother range
    - **Property 5: Smoother stays in range**
    - **Validates: Requirements 4.1**

- [ ] 5. Haunting machine
  - [ ] 5.1 Implement `transition` and configuration validation, with an example test per transition
    - _Requirements: 5.1–5.10_
  - [ ]* 5.2 Write property test for no possession without confirmation
    - **Property 6: No possession without confirmation**
    - **Validates: Requirements 5.4, 5.7**
  - [ ]* 5.3 Write property test for sticky possession
    - **Property 7: Possession is sticky**
    - **Validates: Requirements 5.5, 5.6, 5.8**
  - [ ]* 5.4 Write property test for no flicker inside the band
    - **Property 8: No flicker inside the hysteresis band**
    - **Validates: Requirements 5.4, 5.5**
  - [ ]* 5.5 Write property test for exorcised requiring possession
    - **Property 9: Exorcised requires Possession**
    - **Validates: Requirements 5.6**
  - [ ]* 5.6 Write property test for stop resets
    - **Property 10: Stop resets**
    - **Validates: Requirements 5.9**
  - [ ]* 5.7 Write property test for invalid configurations
    - **Property 11: Invalid configurations rejected**
    - **Validates: Requirements 5.10**

- [ ] 6. Detector pipeline
  - [ ] 6.1 Implement `createDetector` with the bounded queue, failure handling and subscriptions
    - _Requirements: 7.1, 7.2_
  - [ ] 6.2 Implement session statistics
    - _Requirements: 6.1, 6.2_
  - [ ]* 6.3 Write property test for statistics never containing audio
    - **Property 12: Statistics never contain audio**
    - **Validates: Requirements 6.2**
  - [ ]* 6.4 Write property test for the bounded queue
    - **Property 13: Bounded queue**
    - **Validates: Requirements 7.2**

- [ ] 7. Checkpoint
  - `mise run check` passes; every property test runs 200 times; record in the journal any bug a property test found that example tests missed.
