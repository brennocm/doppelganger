# Implementation Plan

- [x] 1. Initialize the repository skeleton
  - [x] 1.1 Create the folder layout from the structure steering with a `README.md` stub per app and package
    - _Requirements: 2.1_
  - [x] 1.2 Write `.gitignore` covering dependencies, builds, caches, reports, `.env*` (keep `.env.example`), datasets, audio outside `apps/web/public/replay/`, editor and OS files; make sure `.kiro/` is not ignored
    - _Requirements: 3.4_
  - [x] 1.3 Add `LICENSE` (MIT), `docs/kiro-journal.md` with the entry template, and a `docs/model-card.md` stub
    - _Requirements: 6.2_

- [x] 2. Toolchain and workspaces
  - [x] 2.1 Create `.mise.toml` with pinned tools and every task listed in Requirement 1.2 (tasks that have no implementation yet print "not implemented" and exit 0)
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Configure the pnpm workspace (`pnpm-workspace.yaml`) and a shared strict `tsconfig.base.json`
    - _Requirements: 2.2_
  - [x] 2.3 Configure the uv workspace (root `pyproject.toml`) with Ruff and mypy strict settings
    - _Requirements: 2.2_

- [x] 3. Quality gates
  - [x] 3.1 Add Biome config, the TypeScript typecheck task, Ruff, mypy and ShellCheck into `mise run check`
    - _Requirements: 3.1, 1.3, 1.4_
  - [x] 3.2 Add dependency-cruiser and import-linter rules from the design; wire them into `check`
    - _Requirements: 2.3_
  - [x] 3.3 Add lefthook with Biome, Ruff, gitleaks and the forbidden-path check
    - _Requirements: 3.2, 3.3_
  - [x] 3.4 Add one smoke test per workspace package
    - _Requirements: 1.3_

- [x] 4. CI and Pages
  - [x] 4.1 Write `.github/workflows/ci.yml` running `mise run check:all`, actions pinned by SHA, least-privilege permissions, frozen lockfiles
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 4.2 Add `pnpm audit`, `pip-audit` and the license allowlist check to `check:all`
    - _Requirements: 4.4_
  - [x] 4.3 Implement `mise run build:pages` and `scripts/verify-pages.mjs` (CSP present, no external origins)
    - _Requirements: 5.2, 5.3, 5.4_
  - [x] 4.4 Write `.github/workflows/pages.yml` to deploy after CI passes on `main`
    - _Requirements: 5.1_

- [x] 5. Decision records
  - [x] 5.1 Write ADR 0001 (stack), 0002 (browser-first inference), 0003 (delivery tiers: Pages, self-hosted, Pro engine), 0004 (MIT license), each with the rejected alternatives
    - _Requirements: 6.1_
  - [x] 5.2 Write the first `README.md`: what it is, live demo link placeholder, tiers, limitations, how to run locally
    - _Requirements: 6.3_

- [x] 6. Checkpoint
  - Run `mise run check` on a clean clone and confirm the first Pages deploy shows placeholder pages at `/` and `/app/`. Add a journal entry.
