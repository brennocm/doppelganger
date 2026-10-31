# Implementation Plan

## Phase A (after project-foundation)

- [ ] 1. Create the hooks through Kiro
  - [x] 1.1 Create `test-affected` (save of `*.ts` in `packages/` and `apps/web/`, and `*.py` in Python packages)
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Create `contracts-codegen` (save in `packages/contracts/schemas/`)
    - _Requirements: 1.3_
  - [x] 1.3 Create `token-contrast` (save in `packages/tokens/`)
    - _Requirements: 1.4_
  - [x] 1.4 Create `secret-sentinel` and `zero-disk-guard` using the prompts in the design
    - _Requirements: 2.1, 2.2_
  - [ ] 1.5 Create the `privacy-audit` manual steering command (`/privacy-audit`)
    - _Requirements: 2.3_
  - [ ] 1.6 Create `journal-keeper` (agent stop) and `spec-lint` (save in `.kiro/specs/`)
    - _Requirements: 3.1, 3.2_
  - [ ] 1.6a Create `prompt-logger` (prompt submit) if the trigger exists in the current Kiro version; otherwise note in the journal that prompts are logged by hand
    - _Requirements: 3.3_
  - [ ] 1.7 Dry-run every hook once and record the output in the journal
    - _Requirements: 9.2_

- [ ] 2. Configure MCP servers
  - [ ] 2.1 Add Playwright, documentation, Hugging Face and GitHub servers to `.kiro/settings/mcp.json`; the GitHub token comes from an environment variable reference
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ] 2.2 Verify each server responds (one tool call each) and record it in the journal
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 3. Create the custom agents through Kiro
  - [ ] 3.1 Create `exorcist` with read-only tools and the security steering
    - _Requirements: 5.1, 5.4_
  - [ ] 3.2 Create `haunter` with the design-system steering and Playwright MCP
    - _Requirements: 5.2, 5.4_
  - [ ] 3.3 Create `necromancer` with the ml-honesty steering and Hugging Face MCP
    - _Requirements: 5.3, 5.4_
  - [ ] 3.4 Try at least one custom agent in the Kiro CLI and one in the IDE; record the differences
    - _Requirements: 9.1_

- [ ] 4. Create the `haunt-snapshots` manual steering command (once `haunted-ui` task 2 exists)
  - Run as `/haunt-snapshots`; uses Playwright MCP against `?test-state=<state>` URLs
  - _Requirements: 4.1, 4.2_

## Phase B (after detection-model provides an ONNX model)

- [ ] 5. Doppelganger MCP server
  - [ ] 5.1 Scaffold `packages/doppelganger-mcp` with the MCP SDK and stdio transport
    - _Requirements: 7.6_
  - [ ] 5.2 Implement `sandbox.py` with the path allowlist
    - _Requirements: 7.4_
  - [ ]* 5.3 Write property test for path sandbox
    - **Property 1: Path sandbox**
    - **Validates: Requirements 7.4**
  - [ ] 5.4 Implement `analyze_audio_file`, `list_models` and `explain_thresholds` on top of `model_lab.inference`
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  - [ ]* 5.5 Write integration test for output consistency with the engine
    - **Property 2: Output consistency with the engine**
    - **Validates: Requirements 7.1**
  - [ ] 5.6 Register the server in `.kiro/settings/mcp.json` and use it from Kiro to analyze the replay fixtures; record it in the journal
    - _Requirements: 7.6, 9.2_

- [ ] 6. Kiro power
  - [ ] 6.1 Check the current Kiro power format in the documentation and create `powers/doppelganger/` with the MCP reference, steering and keywords
    - _Requirements: 8.1, 8.2_
  - [ ] 6.2 Install the power in a clean workspace, test it on a fixture and record the result
    - _Requirements: 8.3_

- [ ] 7. Checkpoint
  - Confirm the journal has IDE, CLI and (if available) Web or Crew entries, and at least three hook findings that changed code.
  - _Requirements: 9.1, 9.2_
