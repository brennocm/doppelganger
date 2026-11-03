# Implementation Plan

- [ ] 1. Structure and content
  - [x] 1.1 Build the page outline with semantic sections and the design tokens
    - _Requirements: 1.1, 1.3_
  - [ ] 1.2 Write the scenario, proof panel, tier table, install commands and build story copy; review it with the `haunter` agent
    - Copy written and reviewed by `haunter` (2026-11-02). Open: the write-up link (Requirement 6.1) is pending (`writeUpUrl` in `apps/landing/content.json` holds the gate marker, and the build omits the item) until the `submission` spec writes it; see design P38 and P46.
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 6.1_
  - [x] 1.3 Import the evaluation summary at build time and render the Limits section
    - _Requirements: 5.1, 5.2_
  - [x]* 1.4 Write the build test that numbers come from the report
    - **Property 2: Numbers come from the report**
    - **Validates: Requirements 5.2**

- [ ] 2. Media
  - [ ] 2.1 Record the Mask → Possession capture from the app (replay mode), encode under 2 MB, add the poster and the reduced-motion swap
    - The slot is built and tested (P46): the lazy video, the poster and the reduced-motion swap work from `capture` in `content.json`. Left open: recording the real capture after the gate and putting its files in `apps/landing/public/media/`.
    - _Requirements: 1.2, 7.3_
  - [x] 2.2 Implement the video facade and the landing CSP
    - _Requirements: 7.1, 7.2_
  - [x]* 2.3 Write Playwright test for no third-party requests before consent
    - **Property 1: No third-party requests before consent**
    - **Validates: Requirements 7.1**

- [ ] 3. Verification
  - [x] 3.1 Add the weight budget check and axe-core checks at 375 px and 1440 px
    - _Requirements: 7.3, 7.4_
  - [ ] 3.2 Capture screenshots with the Playwright MCP and record them in the journal
    - _Requirements: 7.4_
