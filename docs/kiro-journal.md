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
