# Kiro journal

A dated log of how Kiro was used to build Doppelgänger. It is the raw material for the submission write-up, so it records failures and corrections as well as wins. New entries go at the bottom.

Template:

```markdown
## YYYY-MM-DD — <short title>
- Kiro surface: IDE | CLI | Web | Crew
- Feature used: spec | hook | steering | MCP | custom agent | power | PBT
- What happened: <one or two sentences>
- Effect: <time saved, bug caught, decision changed>
```

---

## 2026-10-30 — project-foundation group 1: repository skeleton
- Kiro surface: CLI
- Feature used: spec | steering
- What happened: Ran `git init -b main`, wrote `.gitignore` before the first commit so `.kiro/` stayed tracked, then created the folder layout, README stubs, MIT `LICENSE`, this journal and a model-card stub (tasks 1.1–1.3), one commit each.
- Effect: The initial `.gitignore` also ignored `*.onnx` and other model weights. That was removed before committing, because the spec only asks to exclude datasets and the demo will need to serve model files; the detection-model spec decides how weights are handled. The MIT copyright line names "The Doppelgänger contributors" to keep personal names out of the repository.

## 2026-10-30 — project-foundation group 2: toolchain and workspaces
- Kiro surface: CLI
- Feature used: spec | steering
- What happened: Pinned Node 26.13.0, pnpm 12.16.1, Python 3.12.16 and uv 0.13.6 in `.mise.toml` after checking the official registries, generated `mise.lock` with per-platform checksums, and configured the pnpm workspace, the strict `tsconfig.base.json` and the uv workspace with Ruff and mypy strict (tasks 2.1–2.3).
- Effect: The design's example pins (Node 22, pnpm 9, uv 0.5) were out of date, so the versions came from nodejs.org, npm and PyPI instead. The shell's system Node (25.8.1) failed pnpm's `engineStrict` check, which confirmed that commands must run through mise. Ruff's `CPY001` (per-file copyright header) was disabled because the root `LICENSE` covers it.

## 2026-10-30 — project-foundation group 3: quality gates
- Kiro surface: CLI
- Feature used: spec | steering
- What happened: Wired Biome, `tsc`, Ruff, mypy, dependency-cruiser, import-linter, ShellCheck and the smoke tests into `mise run check`, added lefthook with gitleaks, Biome, Ruff and a forbidden-path script, and proved each gate by committing deliberate violations (tasks 3.1–3.4).
- Effect: Several problems came up. Biome 2.6 now formats Markdown and wanted to rewrite every spec and steering file, so Markdown was excluded from Biome (the prompt history is append-only). `pnpm -r --silent` hid `tsc` errors, against Requirement 1.4, so `--silent` was removed. TypeScript 7.0.2 (native compiler) has no stable JS API, so dependency-cruiser cannot use it; it parses with `@swc/core` instead, and a seeded-violation test confirmed every rule still fires. The design's `gitleaks protect --staged` is replaced by `gitleaks git --pre-commit --staged` in gitleaks 8.30. `check` runs in about 4 s.

## 2026-10-30 — project-foundation group 4: CI and Pages
- Kiro surface: CLI
- Feature used: spec | steering
- What happened: Wrote `ci.yml` (runs `mise run check:all`) and `pages.yml` (deploys after `ci` passes on `main`), added `pnpm audit`, `pip-audit` and a license policy check to `check:all`, and built placeholder landing and app pages with `scripts/verify-pages.mjs` checking the CSP and external origins (tasks 4.1–4.4). Every action is pinned by commit SHA and actionlint passes.
- Effect: Stopped at 4.2 because the license allowlist in Requirement 4.4 would have failed on mypy's own dependencies (PSF-2.0, MPL-2.0). The requirement was changed (agreed with the developer) to add PSF-2.0 and allow MPL-2.0 only for unmodified dev dependencies, with per-version overrides that cite each license file. The same review reversed an earlier choice: TypeScript went back from 7.0.2 to 6.0.3 so dependency-cruiser could use its normal parser, replacing an `@swc/core` workaround that had been made without asking. Fixture audio is now generated at test time, and the testing steering was updated. Other problems: the first edit to `docs/prompt-history.md` was made against an old read of the file and wrote the 001 outcome twice; this was fixed in the same commit before going further. `upload-pages-artifact` v5 drops hidden files by default, which would have lost `.nojekyll`. The deploy itself is not verified yet because the GitHub repository does not exist.

## 2026-10-30 — project-foundation groups 5–6: decision records, README, checkpoint
- Kiro surface: CLI
- Feature used: spec | steering
- What happened: Wrote ADRs 0001–0004 and the first README (tasks 5.1–5.2), then ran the checkpoint on a fresh `git clone` in a temporary directory: `mise install` followed by `mise run check` passed in 7.5 s, and `mise run check:all` in 8.0 s (22 commits scanned by gitleaks, no leaks, no known vulnerabilities, 90 packages within the license policy, 3 HTML files passing the CSP check).
- Effect: Checking the drafts against the repository removed claims that could not be backed up. Biome does not lint HTML here, the README listed macOS as supported although only Linux and WSL2 were tested, and ADR 0002 credited a WebGPU follow-up to a spec that never mentions it. Task 6 stays open: the deploy check needs a GitHub repository with Pages enabled, which only the developer can create.

## 2026-10-30 — project-foundation checkpoint: first Pages deploy
- Kiro surface: CLI
- Feature used: spec
- What happened: The developer created `brennocm/doppelganger`, pushed `main` and set Pages to deploy from GitHub Actions. `ci` passed on the push and `pages` deployed after it. Independent check: `/doppelganger/`, `/doppelganger/app/` and the bundled app script all return 200, and an unknown path returns 404. Task 6 is ticked and the README placeholders now point at the real repository and URL.
- Effect: The `workflow_run` chain from `ci` to `pages` and the `PAGES_BASE` derived from `configure-pages` worked on the first real run, with no fixes needed. project-foundation is complete.

## 2026-10-30 — kiro-workbench: moving from CLI V2 to V3, and the push gate
- Kiro surface: CLI
- Feature used: hook | custom agent | steering
- What happened: Before creating hooks, the Kiro docs showed that the current formats (standalone `.kiro/hooks/*.json` with `"version": "v1"`, PascalCase triggers, agent profiles with `permissions.rules`) target Kiro IDE 1.x and CLI V3. This machine had `kiro-cli 2.24.0`, whose default V2 engine only runs hooks embedded in an agent profile (`agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`) and has no file-save trigger. The developer chose one source of truth (v1 files only, no V2 copies) and `kiro-cli --v3` from now on.
- Effect: Differences found between V2 and V3: V3 adds `PostFileSave`, `SessionStart`, task triggers and agent actions in standalone files; V2 profile fields `allowedTools` and `toolsSettings` are replaced by `permissions.rules`; manual hooks can no longer be created on any surface, so `privacy-audit` became a manual steering file run as `/privacy-audit`. A probe hook did not fire in a V3 headless run because hook loading in V3 headless runs starts at CLI 2.27.1, so the hook dry runs (task 1.7) wait for a CLI update. This session itself still runs on the V2 engine; V3 was used through `kiro-cli chat --v3 --no-interactive`. Pushes stay a manual step by the developer: nothing becomes public without a human looking at it first, and this shell holds no GitHub credentials on purpose.

## 2026-10-30 — kiro-workbench group 1: hooks
- Kiro surface: CLI
- Feature used: hook | steering | spec
- What happened: Updated the spec first (glossary: "Saved" means saved by the agent; manual steering commands replace manual hooks; Requirement 2.3 and the design diagram), then created v1 hooks `test-affected`, `contracts-codegen`, `token-contrast`, `secret-sentinel`, `zero-disk-guard`, `spec-lint`, `journal-keeper` and `prompt-logger` (disabled), and the `/privacy-audit` steering command. Command hooks call scripts in `scripts/hooks/`; `secret-sentinel`, `journal-keeper` and `prompt-logger` have 32 unit tests in `scripts/tests/`, including PII true and false positives, the journal-keeper no-loop case and the prompt-logger redaction-failure case.
- Effect: Each test was checked by breaking the code it protects: removing the placeholder rules failed 5 PII tests, removing the "asked once" guard failed the no-loop test, removing the re-scan after redaction failed a prompt-logger test. Problems fixed on the way: Node's `require` read a temporary gitleaks report as JavaScript because it had no `.json` extension, so `secret-sentinel` missed the secret in its first manual run; `token-contrast` first used an unpinned system `jq`. The prompt-logger writes `set by hand` for the surface because no documented field tells IDE and CLI apart, and it exits 0 on every failure because a non-zero Prompt Submit exit blocks the user's prompt in the IDE. An end-to-end run against a temporary copy of the prompt history redacted a token, an e-mail and a home path. Not done yet: the dry run of each hook inside Kiro (task 1.7).

## 2026-10-30 — kiro-workbench group 2: MCP servers
- Kiro surface: CLI
- Feature used: MCP
- What happened: Wrote `.kiro/settings/mcp.json` with four servers: Playwright (`@playwright/mcp@0.0.83`, Apache-2.0, `--headless --isolated --browser chromium`), documentation through Context7 (`@upstash/context7-mcp@4.4.4`, MIT), Hugging Face (hosted `https://huggingface.co/mcp`), and GitHub (`github-mcp-server` 2.0.3, MIT, pinned in `.mise.toml` so `mise.lock` checksums it, run with `--toolsets=repos,issues,pull_requests --lockdown-mode`). Credentials are only `${HF_TOKEN}` and `${GITHUB_PERSONAL_ACCESS_TOKEN}` references.
- Effect: Verified over the MCP protocol directly: Context7 answered a `resolve-library-id` call without an API key; Playwright and GitHub started and listed 25 and 39 tools; Playwright's first call failed because no browser is installed; the Hugging Face endpoint answered an unauthenticated `initialize`. Real tool calls for GitHub and Hugging Face wait for the developer's tokens, so task 2.2 stays open. Token least privilege, agreed with the developer: `GITHUB_PERSONAL_ACCESS_TOKEN` is fine-grained, limited to `brennocm/doppelganger`, read-only Contents and Metadata, read and write Issues and Pull requests, expiring 2026-12-31; `HF_TOKEN` is read-only; `CONTEXT7_API_KEY` stays unset unless rate limits hit. Even with write tools listed by the GitHub server, the token is the real boundary. The `npx`-started servers are pinned but bypass `pnpm-lock.yaml` and the license check; ADR 0001 records this.

## 2026-10-30 — kiro-workbench group 3: custom agents
- Kiro surface: CLI
- Feature used: custom agent
- What happened: Created `exorcist`, `haunter` and `necromancer` with `kiro-cli agent create`, then edited them to the IDE 1.0 / CLI V3 schema with `permissions.rules`: exorcist reads files and may run only `git diff|log|show|status` and `gitleaks`, with writes denied; haunter reads files and uses the Playwright MCP server; necromancer writes only under `packages/model-lab/` and runs only `mise run model:*`, with the Hugging Face MCP server. None contains credentials.
- Effect: `kiro-cli agent validate` in 2.24 accepted all three but proved weak: it exits 0 even for invalid files and does not check `permissions` at all, so the agents were also loaded under `--v3`. All three loaded. Exorcist ran `git status --short` without a prompt (its allow rule matched) and refused both a `touch` command and a file write; no file was created. The refusals came from the model citing its role, so they show the prompt works but not that the deny rules fired. Task 3.4 (trying an agent in the IDE and comparing) is still open.
