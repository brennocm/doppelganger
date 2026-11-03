# Implementation Plan

- [x] 1. Tokens
  - [x] 1.1 Create `packages/tokens/tokens.json` from the design-system steering (base, contrast fixes, Halloween layer, type, spacing, radius, motion)
    - _Requirements: 7.1_
  - [x] 1.2 Write the token build script (CSS, TS, contrast report) and `contrast-pairs.json`
    - _Requirements: 7.2_
  - [x]* 1.3 Write the contrast test over every pair
    - **Property 4: Token contrast**
    - **Validates: Requirements 7.2**

- [x] 2. App shell and state view
  - [x] 2.1 Build the Main_View layout from the design wireframe with semantic markup and the themed browser surfaces
    - _Requirements: 6.1, 6.2, 6.3, 7.3_
  - [x] 2.2 Implement `haunting-view.ts` and `states.css` keyed on `data-state`
    - _Requirements: 1.1, 1.3, 1.4_
  - [x]* 2.3 Write property test for state presentation
    - **Property 1: State presentation is total**
    - **Validates: Requirements 1.1, 1.4**
  - [x] 2.4 Implement the score display with tabular numerals
    - _Requirements: 1.2_
  - [x]* 2.5 Write property test for the score display
    - **Property 2: Score display**
    - **Validates: Requirements 1.2**
  - [x] 2.6 Implement Test_State_Mode for dev and E2E builds only
    - _Requirements: 8.1, 8.2_
  - [x]* 2.7 Write test that production ignores test-state
    - **Property 5: Test state mode is dev-only**
    - **Validates: Requirements 8.2**

- [x] 3. Spectre
  - [x] 3.1 Add the `levels` message to the worker contract and compute 64 band levels in the worker
    - _Requirements: 2.1_
  - [x] 3.2 Implement the Mask and Unease renderers
    - _Requirements: 2.2, 2.3_
  - [x] 3.3 Implement the Possession torn renderer with the ≤ 3 Hz displacement scheduler and the reduced-motion variant
    - _Requirements: 2.4, 3.2, 3.3_
  - [x]* 3.4 Write property test for the flash rate bound
    - **Property 3: Flash rate bound**
    - **Validates: Requirements 3.2**
  - [x] 3.5 Pause rendering on `visibilitychange`
    - _Requirements: 2.5_

- [x] 4. Twin and possession sequence
  - [x] 4.1 Draw the original Twin SVG with six expressions
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 4.2 Implement the possession sequence, live regions and the optional sound cue (off by default)
    - _Requirements: 3.1, 3.4, 3.5_

- [x] 5. Floating widget
  - [x] 5.1 Implement the Document Picture-in-Picture widget with shared styles and update stream
    - _Requirements: 5.1, 5.3, 5.4_
  - [x] 5.2 Implement the compact in-page fallback
    - _Requirements: 5.2_

- [ ] 6. Verification
  - [x] 6.1 Playwright screenshots of every state (375 px and 1440 px, full and reduced motion) and axe-core checks
    - _Requirements: 6.1, 7.2_
  - [ ] 6.2 Create the `haunt-snapshots` hook (kiro-workbench task 4) and run it
    - The command exists (`.kiro/steering/haunt-snapshots.md`). Left open: running it needs a Kiro session whose shell tool can keep a preview server alive, which the CLI refused (journal entry "End of the resumed overnight run", 2026-11-01). Developer steps: (1) in a separate terminal, start the server from step 1 of the command and wait for `http://127.0.0.1:4318/`; (2) in Kiro, with the Playwright MCP server enabled, run `/haunt-snapshots` and say the server is already running on port 4318; (3) check that the table has 24 rows (6 states × 2 widths × 2 motion settings) and no failing rows; (4) stop the server and add the table, one screenshot and any failures to the journal, then check this box.
    - _Requirements: 6.1_
  - [x] 6.3 Run the `haunter` agent review; fix findings; record before/after screenshots in the journal
    - _Requirements: 1.1, 3.2, 6.3_
