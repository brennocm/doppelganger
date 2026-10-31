# Requirements Document

## Introduction

This spec turns Kiro itself into part of the engineering system: agent hooks that automate quality and privacy checks, custom agents with focused roles, MCP servers that extend what Kiro can see and do, a custom MCP server that exposes Doppelgänger's own detector to Kiro, and a Kiro power that packages it for other people. It runs in two phases: **Phase A** (right after `project-foundation`) and **Phase B** (after `detection-model` produces a usable model).

All hook and agent files are created through Kiro so they use its current native format. This spec defines their behavior.

## Glossary

- **Hook**: a Kiro agent hook stored as a v1 JSON file in `.kiro/hooks/`, run by the Kiro IDE (1.x) and the Kiro CLI V3 (`kiro-cli --v3`).
- **Saved**: saved or edited by the Kiro agent. Manual editor saves do not trigger hooks; the git pre-commit hook and CI cover manual edits.
- **Turn_Report**: the findings that command hooks collect during one agent turn. It lives in a state file under `.git/kiro-hooks/`, so it is never committed, and the `hook-findings` Hook delivers it to the agent when the turn ends. Command-hook output on file-save events does not reach the agent in the Kiro CLI V3, so this is how those hooks "report in the chat".
- **Manual_Steering_Command**: a steering file with `inclusion: manual`, run on demand as a `/<name>` slash command. Kiro no longer supports creating manual-trigger hooks, so on-demand workflows use this instead.
- **Custom_Agent**: a Kiro custom agent configuration with its own prompt, tools and context.
- **MCP_Config**: `.kiro/settings/mcp.json`.
- **Doppelganger_MCP**: the Python MCP server in `packages/doppelganger-mcp`.
- **Power**: a Kiro power bundling the Doppelganger_MCP with its steering and usage guidance.
- **Journal**: `docs/kiro-journal.md`.

## Requirements

### Requirement 1: Quality hooks (Phase A)

**User Story:** As a developer, I want Kiro to verify my changes as I work, so that I find problems minutes after making them instead of at review time.

#### Acceptance Criteria

1. WHEN a TypeScript file under `packages/` or `apps/web/` is saved, THE `test-affected` Hook SHALL run the tests of the affected package and add each failure to the Turn_Report.
2. WHEN a Python file under `apps/engine/`, `packages/model-lab/` or `packages/doppelganger-mcp/` is saved, THE `test-affected` Hook SHALL run Ruff and the affected pytest suite and add each failure to the Turn_Report.
3. WHEN a file under `packages/contracts/schemas/` is saved, THE `contracts-codegen` Hook SHALL run `mise run gen:contracts` and add the changed generated files, or the failure, to the Turn_Report.
4. WHEN a file under `packages/tokens/` is saved, THE `token-contrast` Hook SHALL rebuild the tokens and add a build failure, including any contrast pair below its target, to the Turn_Report.

### Requirement 2: Privacy and security hooks (Phase A)

**User Story:** As the author of a privacy tool, I want Kiro to block privacy regressions automatically, so that the core promise cannot break silently.

#### Acceptance Criteria

1. WHEN any source file is saved, THE `secret-sentinel` Hook SHALL scan the file for credentials, personal data (e-mails, local paths, IPs) and committed tokens, and SHALL add each finding with its line to the Turn_Report.
2. WHEN a file under `apps/web/src/`, `apps/engine/` or `packages/detector/` is saved, THE `zero-disk-guard` Hook SHALL ask the agent to check the change against the security steering (disk writes of audio, network calls to non-self origins, audio in logs, recording packages) and report violations.
3. WHEN the developer runs `/privacy-audit`, THE `privacy-audit` Manual_Steering_Command SHALL run a full audit of the repository against the security steering and write the result to the chat.
4. THE Turn_Report, the `hook-findings` message and the Journal SHALL never contain a detected secret or personal-data value. Each such finding SHALL give its type, file, line and a masked snippet made of the value's first 4 characters followed by "…" ("…" alone when the value has 4 characters or fewer).
5. THE Turn_Report SHALL hold at most 50 findings, followed by one line "…and N more" when more were found.
6. WHEN an agent turn ends and the Turn_Report is not empty, THE `hook-findings` Hook SHALL deliver it to the agent at most once per turn and then clear it.

### Requirement 3: Spec and journal hooks (Phase A)

**User Story:** As a hackathon entrant, I want evidence of how Kiro was used to accumulate automatically, so that the write-up is accurate and cheap to produce.

#### Acceptance Criteria

1. WHEN an agent turn finishes after changing files, THE `journal-keeper` Hook SHALL append a dated entry to the Journal in the format defined in the kiro-workflow steering.
2. WHEN a file under `.kiro/specs/` is saved, THE `spec-lint` Hook SHALL check that every task references existing requirement IDs and that every correctness property names the requirements it validates.
3. WHERE Kiro supports a prompt-submit trigger, WHEN the developer submits a prompt, THE `prompt-logger` Hook SHALL append it verbatim to `docs/prompt-history.md` in the file's format, with secrets and personal data replaced by placeholders; otherwise prompts are logged by hand.

### Requirement 4: Visual verification hook (Phase A)

**User Story:** As a Costume Contest entrant, I want screenshots of every haunting state on demand, so that I can review the UI without clicking through scenarios by hand.

#### Acceptance Criteria

1. WHEN the developer runs `/haunt-snapshots`, THE `haunt-snapshots` Manual_Steering_Command SHALL use the Playwright MCP server to open the app in test mode, force each haunting state, and capture screenshots at 375px and 1440px, with and without reduced motion.
2. THE `haunt-snapshots` Manual_Steering_Command SHALL report any state whose text contrast or layout overflow checks fail.

### Requirement 5: Custom agents (Phase A)

**User Story:** As a developer, I want specialized agents with narrow roles, so that reviews are focused and repeatable.

#### Acceptance Criteria

1. THE Repository SHALL define a Custom_Agent `exorcist` (security and privacy reviewer) with read-only file tools, the security steering in context, and an output format of findings ranked by severity.
2. THE Repository SHALL define a Custom_Agent `haunter` (UI and accessibility reviewer) with the design-system steering in context and access to the Playwright MCP server.
3. THE Repository SHALL define a Custom_Agent `necromancer` (model-lab specialist) with the ml-honesty steering in context and access to the Hugging Face MCP server.
4. THE Custom_Agent definitions SHALL contain no credentials.

### Requirement 6: Third-party MCP servers (Phase A)

**User Story:** As a developer, I want Kiro to reach the documentation, browser and model hub directly, so that it writes correct code instead of guessing.

#### Acceptance Criteria

1. THE MCP_Config SHALL configure a Playwright MCP server for browser automation and screenshots.
2. THE MCP_Config SHALL configure a documentation MCP server for up-to-date library docs (ONNX Runtime Web, Web Audio, FastAPI).
3. THE MCP_Config SHALL configure the Hugging Face MCP server for model and dataset discovery.
4. THE MCP_Config SHALL configure the GitHub MCP server for issues and pull requests, with its token supplied by an environment variable reference.
5. THE MCP_Config SHALL contain no literal secrets.

### Requirement 7: Doppelganger MCP server (Phase B)

**User Story:** As a developer, I want Kiro to call the project's own detector, so that it can check fixtures, debug calibration and explain scores while building.

#### Acceptance Criteria

1. THE Doppelganger_MCP SHALL expose a tool `analyze_audio_file(path)` that returns per-window dissonance scores, the summary verdict and the model ID.
2. THE Doppelganger_MCP SHALL expose a tool `list_models()` that returns the model manifests available locally, including SHA-256 and license.
3. THE Doppelganger_MCP SHALL expose a tool `explain_thresholds()` that returns the active thresholds, smoothing and hysteresis settings with a plain-language explanation.
4. WHEN `analyze_audio_file` receives a path outside the configured allowlisted directories, THE Doppelganger_MCP SHALL refuse the request.
5. THE Doppelganger_MCP SHALL never write audio to disk and never make network requests.
6. THE MCP_Config SHALL register the Doppelganger_MCP over stdio.

### Requirement 8: Kiro power (Phase B)

**User Story:** As another Kiro user, I want to install a Doppelgänger power, so that I can check suspicious audio from inside Kiro.

#### Acceptance Criteria

1. THE Repository SHALL contain a Power that bundles the Doppelganger_MCP, a short steering file describing safe use and limitations, and activation keywords (for example "deepfake", "voice clone", "suspicious audio").
2. THE Power documentation SHALL state that the detector is probabilistic and SHALL link to the model card.
3. THE Power SHALL be evaluated by installing it in a clean Kiro workspace, and the result SHALL be recorded in the Journal.

### Requirement 9: Kiro surfaces evidence

**User Story:** As a hackathon entrant, I want to have tried more than one Kiro surface, so that the write-up can compare them honestly.

#### Acceptance Criteria

1. THE Journal SHALL record at least one session each in the Kiro IDE and the Kiro CLI, and in Kiro Web or Crew if available, with notes on how they differed.
2. THE Journal SHALL record how the custom agents and hooks changed the build (bugs caught, time saved, decisions changed).
