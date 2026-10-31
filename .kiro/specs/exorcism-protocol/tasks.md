# Implementation Plan

- [ ] 1. Incident summary
  - [ ] 1.1 Add the `IncidentSummary` schema to `packages/contracts` and regenerate types
    - _Requirements: 3.1, 3.2_
  - [ ] 1.2 Implement `buildIncidentSummary` (text and JSON) in `packages/detector`
    - _Requirements: 3.1, 3.4, 3.5_
  - [ ]* 1.3 Write property test for forbidden data exclusion
    - **Property 1: Summary excludes forbidden data**
    - **Validates: Requirements 3.2**
  - [ ]* 1.4 Write property test for determinism
    - **Property 2: Summary is deterministic**
    - **Validates: Requirements 3.1**
  - [ ]* 1.5 Write property test for replay disclosure
    - **Property 3: Replay is always disclosed**
    - **Validates: Requirements 3.5**

- [ ] 2. Protocol panel
  - [ ] 2.1 Implement the panel with the four steps, native checkboxes and the collapsed Exorcised form
    - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.2_
  - [ ] 2.2 Wire completion to `detector.completeProtocol()`
    - _Requirements: 1.3_
  - [ ]* 2.3 Write property test for completion requiring all steps
    - **Property 4: Completion requires all steps**
    - **Validates: Requirements 1.2, 1.3**
  - [ ] 2.4 Add Copy (with textarea fallback) and Download (Blob URL revoked after use)
    - _Requirements: 3.3_
  - [ ] 2.5 Show the protocol entry point in the Widget
    - _Requirements: 1.4_

- [ ] 3. Code word reminder
  - [ ] 3.1 Implement the setting with validation, the hint explanation and deletion
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 3.2 Write property test for the reminder length bound
    - **Property 5: Reminder length bound**
    - **Validates: Requirements 2.1**

- [ ] 4. Verification
  - [ ] 4.1 Playwright journey: Possession → all steps → Exorcised → copy and download summary
    - _Requirements: 1.3, 3.3_
  - [ ] 4.2 Run the `exorcist` agent on the feature and record the findings in the journal
    - _Requirements: 3.2_
