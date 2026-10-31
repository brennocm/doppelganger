# Implementation Plan

- [ ] 1. Repository readiness
  - [ ] 1.1 Finalize `README.md` with links, screenshot, tiers, limits and docs
    - _Requirements: 1.3_
  - [ ] 1.2 Confirm the license is detected, `.kiro/` is tracked, and a full-history gitleaks run is clean
    - _Requirements: 1.1, 1.2, 1.4_
  - [ ] 1.3 Write `scripts/release-check.sh`
    - _Requirements: 1.4, 4.3_

- [ ] 2. Write-up
  - [ ] 2.1 Write `scripts/journal-digest.mjs`
    - _Requirements: 2.2, 2.4_
  - [ ]* 2.2 Write property test for digest completeness
    - **Property 1: Journal digest completeness**
    - **Validates: Requirements 2.2, 2.4**
  - [ ] 2.3 Write `docs/KIRO.md` following the design structure, citing files, commits and journal entries
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 2.4 Run the `exorcist` agent over the Write_Up for unverifiable claims and fix them
    - _Requirements: 2.4_

- [ ] 3. Video
  - [ ] 3.1 Record the genuine and clone call segments (own voice, consent note) and the app captures
    - _Requirements: 3.3, 3.4_
  - [ ] 3.2 Record the Kiro segments: spec tasks, a hook finding, a PBT counterexample, the MCP server, the custom agents
    - _Requirements: 3.2_
  - [ ] 3.3 Edit to at most 3:00 with English captions, labelled replays and royalty-free or no music; publish on YouTube
    - _Requirements: 3.1, 3.5_

- [ ] 4. Submission
  - [ ] 4.1 Fill in the form: Costume Contest, repository, demo, video, write-up
    - _Requirements: 4.1, 4.2_
  - [ ] 4.2 Run `release-check.sh` from a logged-out environment and submit
    - _Requirements: 4.3_

- [ ] 5. Schedule tracking
  - [ ] 5.1 At each milestone date, record status in the journal and apply the scope-cut order if a milestone slipped by more than 2 days
    - _Requirements: 5.1, 5.2_
