# Design Document

## Overview

Kiro gets three kinds of extensions: **hooks** (event-driven automation), **custom agents** (role-scoped reviewers and specialists) and **MCP servers** (third-party plus our own). The power packages our MCP server for reuse. Hook and agent files are generated through Kiro's own UI or commands, so this document specifies behavior, triggers and prompts, not file syntax.

## Architecture

```text
Kiro IDE / CLI
 ├── Hooks (.kiro/hooks/)
 │    ├── test-affected        on save: *.ts, *.py         → run tests
 │    ├── contracts-codegen    on save: contracts/schemas  → mise run gen:contracts
 │    ├── token-contrast       on save: packages/tokens    → build + contrast report
 │    ├── secret-sentinel      on save: any source file    → secret/PII scan
 │    ├── zero-disk-guard      on save: web/engine/detector→ security steering review
 │    ├── spec-lint            on save: .kiro/specs        → reference integrity
 │    ├── journal-keeper       on agent stop               → append journal entry
 │    ├── privacy-audit        manual                      → full audit
 │    └── haunt-snapshots      manual                      → Playwright screenshots of all states
 ├── Custom agents: exorcist · haunter · necromancer
 └── MCP (.kiro/settings/mcp.json)
      ├── playwright         (browser automation)
      ├── docs               (library documentation)
      ├── huggingface        (models and datasets)
      ├── github             (token from env var)
      └── doppelganger       (stdio → packages/doppelganger-mcp)
```

## Components and Interfaces

### Hook prompts

Each hook that asks the agent to act uses a short, specific prompt. Examples:

- **zero-disk-guard:** "Review the saved file against `.kiro/steering/security.md`. Report any code that writes audio to disk or browser storage, sends audio or scores to a non-self origin, logs audio or user file names, or adds a recording/upload/transcription dependency. Reply 'clean' if none. Do not edit files."
- **journal-keeper:** "If files changed in this turn, append one entry to `docs/kiro-journal.md` using the template in the kiro-workflow steering. Be factual; include failures. Do not modify any other file."
- **spec-lint:** "In the saved spec, list tasks whose `_Requirements_` reference IDs that do not exist in `requirements.md`, and correctness properties without a 'Validates' line. Reply 'consistent' if none."

Command hooks (`test-affected`, `contracts-codegen`, `token-contrast`) run shell commands through `mise`, so their behavior equals what CI runs.

### Custom agents

| Agent | Role | Context | Tools |
| --- | --- | --- | --- |
| `exorcist` | Security and privacy review of a diff or folder | security, structure steering | Read-only file tools, shell limited to `git diff`, `gitleaks` |
| `haunter` | UI, motion-safety and accessibility review | design-system, testing steering | Read files, Playwright MCP |
| `necromancer` | Model selection, evaluation, calibration | ml-honesty, tech steering | Read/write in `packages/model-lab`, Hugging Face MCP, shell for `mise run model:*` |

### Doppelganger MCP server

```text
packages/doppelganger-mcp/
 ├── pyproject.toml
 └── src/doppelganger_mcp/
      ├── server.py        # MCP SDK, stdio transport, tool registration
      ├── analysis.py      # uses model_lab.inference (same code as the engine)
      └── sandbox.py       # path allowlist (DOPPELGANGER_MCP_ROOTS env var, default: repo fixtures)
```

Tools:

| Tool | Input | Output |
| --- | --- | --- |
| `analyze_audio_file` | `path: str`, `model_id?: str` | `{model_id, windows: [{start_s, end_s, score}], summary: {peak, mean, state_timeline, verdict}}` |
| `list_models` | none | `[{id, version, sha256, license, window_samples, hop_samples}]` |
| `explain_thresholds` | none | `{unease, possession, release, alpha, confirm_windows, release_windows, explanation}` |

`analyze_audio_file` resolves the path, rejects anything outside the allowlisted roots or above the engine's size/duration limits, decodes in memory and reuses the same windowing and calibration as the engine.

### Power

A folder `powers/doppelganger/` containing the power definition in Kiro's current format, the MCP server reference, a steering file ("use for suspicious audio files; the score is probabilistic; never treat it as proof; see the model card") and activation keywords.

## Data Models

The MCP tool outputs reuse the `AutopsyReport` and `ModelManifest` schemas from `packages/contracts`.

## Correctness Properties

### Property 1: Path sandbox

*For any* requested path, `analyze_audio_file` reads the file only if its resolved real path (after following symlinks) is inside an allowlisted root; otherwise it returns an error and performs no read.

**Validates: Requirements 7.4**

### Property 2: Output consistency with the engine

*For any* fixture audio, `analyze_audio_file` returns the same per-window scores (to within 1e-6) as the engine's Autopsy endpoint for the same model.

**Validates: Requirements 7.1**

## Error Handling

- Unknown model ID: tool error listing available IDs.
- Unsupported format or decode failure: tool error naming the format, never a stack trace.
- Model hash mismatch: tool error; the model is not loaded.

## Testing Strategy

- Hypothesis property test for Property 1, generating paths with `..`, symlinks, absolute paths and Unicode.
- Integration test for Property 2 against the engine's FastAPI `TestClient`.
- Hooks: one manual dry run each, recorded in the journal with a screenshot of the output.
