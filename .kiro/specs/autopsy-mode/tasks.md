# Implementation Plan

- [x] 1. Report model and verdict
  - [x] 1.1 Add the `AutopsyReport` schema to `packages/contracts`
    - _Requirements: 3.5, 4.3_
  - [x] 1.2 Implement `deriveVerdict` by replaying the haunting machine
    - _Requirements: 2.4, 3.3_
  - [x]* 1.3 Write property test for verdict consistency
    - **Property 1: Verdict consistency with the state machine**
    - **Validates: Requirements 2.4, 3.3**
  - [x]* 1.4 Write property test for report size and schema
    - **Property 3: Report has no audio**
    - **Validates: Requirements 3.5**

- [x] 2. Intake and batch analysis
  - [x] 2.1 Implement drag-and-drop and the picker with size check before reading, then decoding, duration check and supported-format listing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x]* 2.2 Write property test for limits enforced before decoding
    - **Property 4: Limits enforced before decoding**
    - **Validates: Requirements 1.3**
  - [x] 2.3 Add batch mode with progress and cancellation to the worker
    - _Requirements: 2.1, 2.2, 2.3_
  - [x]* 2.4 Write property test for batch equals streaming
    - **Property 2: Batch equals streaming**
    - **Validates: Requirements 2.1**

- [x] 3. Report view
  - [x] 3.1 Implement the timeline canvas, thresholds, state segments, playhead and keyboard control
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Implement the verdict block and JSON download
    - _Requirements: 3.4, 3.5_

- [x] 4. Pro engine option (after local-runtime)
  - [x] 4.1 Detect same-origin engine availability and show the model choice
    - _Requirements: 4.1_
  - [x] 4.2 Upload to the engine Autopsy endpoint with the session token; render the shared report
    - _Requirements: 4.2, 4.3_

- [ ] 5. Verification
  - [ ] 5.1 Playwright tests with both replay fixtures; record the verdicts in the journal
    - _Requirements: 3.3_
