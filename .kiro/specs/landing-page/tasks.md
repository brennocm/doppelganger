# Implementation Plan

- [x] 1. Structure and content
  - [x] 1.1 Build the page outline with semantic sections and the design tokens
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 Write the scenario, proof panel, tier table, install commands and build story copy; review it with the `haunter` agent
    - Copy written and reviewed by `haunter` (2026-11-02). The write-up link points at `docs/KIRO.md` (P50).
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 6.1_
  - [x] 1.3 Import the evaluation summary at build time and render the Limits section
    - _Requirements: 5.1, 5.2_
  - [x]* 1.4 Write the build test that numbers come from the report
    - **Property 2: Numbers come from the report**
    - **Validates: Requirements 5.2**

- [x] 2. Media
  - [x] 2.1 Add the Mask → Possession capture (under 2 MB), the poster and the reduced-motion swap
    - Without replay clips there is no replay to record, so the capture is made from the visual-test screenshots of the three alert levels (P50).
    - _Requirements: 1.2, 7.3_
  - [x] 2.2 Implement the landing CSP (the video facade was removed in P50)
    - _Requirements: 7.1, 7.2_
  - [x]* 2.3 Write Playwright test for no third-party requests
    - **Property 1: No third-party requests**
    - **Validates: Requirements 7.1**

- [ ] 3. Verification
  - [x] 3.1 Add the weight budget check and axe-core checks at 375 px and 1440 px
    - _Requirements: 7.3, 7.4_
  - [ ] 3.2 Capture screenshots with the Playwright MCP and record them in the journal
    - _Requirements: 7.4_
