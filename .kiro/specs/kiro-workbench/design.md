# Design Document

## Overview

Kiro gets three kinds of extensions: **hooks** (event-driven automation), **custom agents** (role-scoped reviewers and specialists) and **MCP servers** (third-party plus our own). The power packages our MCP server for reuse. Hook and agent files are generated through Kiro's own UI or commands, so this document specifies behavior, triggers and prompts, not file syntax.

## Architecture

```text
Kiro IDE 1.x / CLI V3 (kiro-cli --v3)
 ├── Hooks (.kiro/hooks/*.json, schema v1)
 │    ├── test-affected        PostFileSave: *.ts, *.py    → run tests
 │    ├── contracts-codegen    PostFileSave: contracts/schemas → mise run gen:contracts
 │    ├── token-contrast       PostFileSave: packages/tokens → build + contrast report
 │    ├── secret-sentinel      PostFileSave: any file      → scripts/secret-sentinel.sh (gitleaks + PII)
 │    ├── zero-disk-guard      PostFileSave: web/engine/detector → agent review vs security steering
 │    ├── spec-lint            PostFileSave: .kiro/specs   → reference integrity
 │    ├── journal-keeper       Stop                        → scripts/journal-keeper.py (asks for one entry at most)
 │    ├── hook-findings        UserPromptSubmit + Stop     → scripts/hooks/findings.py (delivers the Turn_Report once per turn)
 │    └── prompt-logger        UserPromptSubmit            → scripts/prompt-logger.py (disabled until enabled by the developer)
 ├── Manual steering commands (.kiro/steering/*.md, inclusion: manual)
 │    ├── /privacy-audit                                   → full audit
 │    └── /haunt-snapshots                                 → Playwright screenshots of all states
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

File triggers fire only when the Kiro agent saves or edits a file (see Saved in the requirements glossary). Command hooks read the saved path from the `file_path` field of the event JSON on STDIN. The Kiro CLI V3 does not fill in `{{filePath}}`, so commands do not use it, and `resolve-path.sh` ignores any argument that is still an unfilled `{{…}}` placeholder.

### Turn_Report delivery

The dry run in task 1.7 showed that in the Kiro CLI V3, output from `PostFileSave` command hooks never reaches the agent, whatever the exit code. So the four command hooks on file saves do not print their findings; they add them to the Turn_Report instead:

- **State file:** `.git/kiro-hooks/findings/<session>.json`, one per session, never committed. Writes take a file lock, because several hooks run at once for the same save.
- **Finding:** `{hook, kind, file, line, detail}`. For secrets and personal data, `detail` is the masked snippet: the first 4 characters of the value followed by "…", or "…" alone when the value has 4 characters or fewer. The raw value is used only in memory. gitleaks writes its report to a pipe (`--report-path -`), never to a file. For test, codegen and token failures, `detail` is a short summary plus the command that reproduces the failure (for example `mise run test -- packages/detector`). Test output is not copied, because it could echo a secret.
- **Cap:** at most 50 findings are stored; later ones only increase an `overflow` counter, which is shown as "…and N more".
- **Turn boundaries:** `findings.py turn-start`, on `UserPromptSubmit`, clears the "delivered" flag. `findings.py deliver`, on `Stop`, does nothing if the report is empty or was already delivered in this turn. Otherwise it prints `{"decision": "block", "reason": "<findings>"}`, marks the report as delivered and clears it. Findings that arrive after delivery wait for the next turn, so the follow-up turn can never loop.
- **Exit codes:** command hooks on file saves always exit 0 and print at most one masked summary line. A non-zero exit would show a CLI warning to the user; in the IDE it would send stderr to the agent a second time.

### Command-hook scripts

- **secret-sentinel** (`scripts/hooks/secret-sentinel.sh`, logic in `scripts/hooks/findings.py`): reads the saved path from the hook event on STDIN, runs `gitleaks dir` on that file and a PII check (`scripts/pii_scan.py`) for e-mails, local home paths and IPv4 addresses, and adds each hit to the Turn_Report as `path:line` with a masked snippet. The PII check ignores documented placeholders: `example.com` and `example.org` addresses, `127.0.0.1`, `0.0.0.0`, the RFC 5737 documentation ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and placeholder paths such as `/home/<user>`. No LLM call.
- **journal-keeper** (`scripts/journal-keeper.py`): on `Stop`, compares `git status --porcelain` with a snapshot taken at the start of the turn. When files other than `docs/kiro-journal.md` and `docs/prompt-history.md` changed and the journal was not touched, it returns `{"decision": "block", "reason": "<journal-keeper prompt>"}` once; it records that it asked, so it never asks twice in the same turn and the follow-up turn cannot loop.
- **prompt-logger** (`scripts/prompt-logger.py`): on `UserPromptSubmit`, redacts the prompt first (gitleaks findings, e-mails, home paths, IPs, using the same placeholder rules), then appends the next numbered entry with `Outcome: _pending_`. The surface is `CLI` or `IDE` only when the event payload or environment identifies it reliably; otherwise `set by hand`. Kiro CLI sets `KIRO_CUSTOM_USER_AGENT` to `KiroCLI/<version> …` in every hook's environment, even when the session was started with no `KIRO_*` variables, so a value starting with `KiroCLI/` means `CLI`. No IDE marker has been observed yet, so IDE prompts stay `set by hand`. The spec field is always `set by hand`, because the prompt does not say which spec it belongs to. If redaction fails for any reason, nothing is written and a warning is printed. Shipped with `enabled: false`; the developer enabled it on 2026-10-30, and since then it is the only writer of new entries.

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

#### Implementation details (P36)

- **Shared Autopsy code.** The engine's WAV decoder (`audio_file.py`), its detector pipeline ports (`pipeline.py`: windower, voice activity check, `StreamSession`) and its report builder (`autopsy.py`) move unchanged into `packages/model-lab/src/model_lab/`. `score_logits` and `InferenceError` move to `model_lab.scoring`. `model_lab.inference` re-exports all of them, so the engine and the MCP server both import model-lab only through the published inference module. The engine keeps thin modules with the old names that re-export from `model_lab.inference`, so its code and tests do not change. Import-linter forbids both the engine and the MCP server from importing any other model_lab module. The reason for the move is that Property 2 needs the same code path, and Python packages must not import from `apps/engine`.
- **Formats and limits.** Like the engine (local-runtime P29), the server decodes WAV only, in memory. It refuses files over 20 MB before reading them (from `stat`) and recordings over 5 minutes from the WAV header.
- **Sandbox.** `DOPPELGANGER_MCP_ROOTS` is a `:`-separated list of folders. The default is `apps/web/public/replay` in the repository. A path is resolved with `Path.resolve(strict=True)`, which follows every symlink. It is read only if the result is a regular file inside a resolved root. Any other path is refused with the same message, and the file is never opened. The read itself uses `os.open` with `O_NOFOLLOW | O_NONBLOCK`, then `fstat` on the descriptor: the file must still be a regular file under 20 MB. It reads at most 20 MB + 1 bytes, so swapping in a symlink, FIFO or device after the check cannot hang the server or exhaust memory. An `OSError` while reading gets the same refusal message, so no local path ends up in the transcript (exorcist L1, L2).
- **Models.** `DOPPELGANGER_MCP_MODELS` is a `:`-separated list of folders with manifests (default `apps/web/public/models`). `list_models` reads the manifests only. `analyze_audio_file` loads the chosen model through `OnnxModel.from_manifest_file`, which verifies the SHA-256 first. A manifest vouches for its own model, so `DOPPELGANGER_MCP_MODELS` is trusted configuration, like any path the user puts in their MCP config (exorcist L3, accepted). Without `model_id`, the first manifest in sorted order is used.
- **Output.** Window `score` is the raw calibrated Dissonance_Score, or null for an unvoiced window. `summary` has `peak` and `mean` over the scored windows (null if there are none), `state_timeline` (the report's `states`), `verdict` and `verdict_reason`. A fixed `note` says that the score is probabilistic, is not proof and does not identify a person, and points to `docs/model-card.md`. `explain_thresholds` returns the `HauntingConfig` defaults that the engine's Autopsy uses.
- **SDK.** `mcp==2.3.0` (MIT), with `MCPServer` and `run()` on stdio. Problems the model can fix (outside the sandbox, too large, not WAV, unknown model) are raised as `ToolError`. The server makes no network requests and writes nothing.
- **Command.** `uv run --locked --package doppelganger-mcp python -m doppelganger_mcp`, from the repository root.

### Power

A folder `powers/doppelganger/` containing the power definition in Kiro's current format, the MCP server reference, a steering file ("use for suspicious audio files; the score is probabilistic; never treat it as proof; see the model card") and activation keywords.

#### Format and details (P37, checked 2026-11-02)

- **Format.** kiro.dev (`/docs/powers/create`, `/docs/powers/installation`) now documents the Agent Plugins format. It has a `plugin.json` manifest (schema `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`; only `$schema` and `name` are required, with no extra properties), an optional `mcp.json`, and `skills/<name>/SKILL.md`. `POWER.md` with `steering/` is the legacy format and its front-matter is no longer documented. The power therefore ships the "steering file" of Requirement 8.1 as the skill `skills/doppelganger-safe-use/SKILL.md`. Kiro loads that skill when the power activates.
- **Files.** `plugin.json` holds `name: doppelganger`, a version, a description, an `author` object (the project, not a person), the repository URL, MIT, and keywords including "deepfake", "voice clone" and "suspicious audio". `mcp.json` declares one stdio server, `doppelganger`, which Kiro namespaces at install time. `README.md` covers setup, the probabilistic nature of the score and the model card link (Requirement 8.2).
- **Server command.** The docs do not say which working directory a power's server starts in. The command is therefore `sh -c 'exec uv run --locked --directory "$DOPPELGANGER_REPO" --package doppelganger-mcp python -m doppelganger_mcp'`. `DOPPELGANGER_REPO` (a clone of this repository) and the optional `DOPPELGANGER_MCP_ROOTS` and `DOPPELGANGER_MCP_MODELS` are passed as `${VAR}` references in `env`, the documented form. The server makes no network requests, and the shell string is constant, with only the quoted variable expanded.
- **Limits stated in the skill.** The score is a probabilistic Dissonance_Score, not proof, and it does not identify a person. The only model shipped today is the synthetic CI model, whose scores mean nothing. Real use waits for detection-model 6.4, and the skill and README say so. Only WAV files are read.
- **Tests.** A pytest checks the manifest against the published schema's fields, the keywords, the skill's front-matter (name equal to its folder, description ≤ 1024 characters), that `mcp.json` holds only `${VAR}` references and no literal values, and that the docs mention the model card. It then starts the exact command from `mcp.json` with `DOPPELGANGER_REPO` set and lists the tools over stdio. Installing it in a clean workspace (task 6.2) is a manual step for the developer, because `kiro-cli powers install` changes user-level Kiro state.

## Data Models

The MCP tool outputs reuse the `AutopsyReport` and `ModelManifest` schemas from `packages/contracts`.

## Correctness Properties

### Property 1: Path sandbox

*For any* requested path, `analyze_audio_file` reads the file only if its resolved real path (after following symlinks) is inside an allowlisted root; otherwise it returns an error and performs no read.

"Resolved real path" means strict POSIX realpath, so ".." after a regular file collapses lexically (`inside.wav/../x` is `root/x`).

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
- Command-hook scripts: unit tests in `scripts/tests/` (PII true and false positives, journal-keeper no-loop case, prompt-logger redaction-failure case, an unfilled `{{…}}` argument in `resolve-path.sh`, and for the Turn_Report: masking, the raw value never appearing in the state file, the Stop message or the hook's stdout and stderr, the 50-finding cap, and delivery at most once per turn).
