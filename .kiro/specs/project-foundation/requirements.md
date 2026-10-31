# Requirements Document

## Introduction

This spec sets up the repository skeleton, toolchain, quality gates, CI and the GitHub Pages pipeline. Every other spec builds on it. Done means a clean clone runs `mise install && mise run check` successfully on an empty skeleton, and a Pages deploy publishes placeholder landing and app pages under a strict CSP.

## Glossary

- **Repository**: the public GitHub repository for Doppelgänger.
- **Toolchain**: the versions of Node, pnpm, Python and uv pinned in `.mise.toml`.
- **Check**: the `mise run check` command, the definition of done.
- **Pages_Artifact**: the static bundle deployed to GitHub Pages (landing at `/`, app at `/app/`).

## Requirements

### Requirement 1: Pinned toolchain and command interface

**User Story:** As a developer, I want one pinned toolchain and one command interface, so that I, Kiro and CI run the same thing.

#### Acceptance Criteria

1. THE Repository SHALL pin Node, pnpm, Python and uv versions in `.mise.toml`.
2. THE Repository SHALL expose the tasks `check`, `check:all`, `fix`, `dev`, `dev:engine`, `test`, `gen:contracts`, `model:eval`, `model:export` and `build:pages` through `mise`.
3. WHEN `mise run check` runs on a clean clone after `mise install`, THE Check SHALL finish successfully in under 2 minutes on the skeleton.
4. WHEN any check step fails, THE Check SHALL exit non-zero and print the failing file and rule.

### Requirement 2: Workspace layout

**User Story:** As a developer, I want the layout defined in the structure steering, so that code always has an obvious home.

#### Acceptance Criteria

1. THE Repository SHALL contain the folders `apps/web`, `apps/landing`, `apps/engine`, `packages/detector`, `packages/contracts`, `packages/tokens`, `packages/model-lab`, `packages/doppelganger-mcp`, `infra/docker`, `scripts`, `docs/adr`.
2. THE Repository SHALL use pnpm workspaces for TypeScript packages and a uv workspace for Python packages.
3. THE Repository SHALL enforce the dependency rules in the structure steering with an automated boundary check that runs in `check`.

### Requirement 3: Quality gates

**User Story:** As a developer, I want strict formatting, linting, typing and secret scanning, so that mistakes are caught before review.

#### Acceptance Criteria

1. THE Check SHALL run Biome, the TypeScript compiler in strict mode, Ruff, mypy in strict mode, ShellCheck and the unit and property tests.
2. THE Repository SHALL run gitleaks in a pre-commit hook and in CI.
3. WHEN a staged file matches `.env`, `.env.*` (except `.env.example`), `*.pem` or `*.key`, THE pre-commit hook SHALL block the commit.
4. THE `.gitignore` SHALL exclude dependencies, build outputs, caches, test reports, local environment files, datasets and editor or personal configuration, and SHALL NOT exclude `.kiro/`.

### Requirement 4: Continuous integration

**User Story:** As a maintainer, I want CI to prove every change, so that the public repository stays green.

#### Acceptance Criteria

1. WHEN a pull request is opened or a commit lands on `main`, THE CI SHALL run `mise run check:all`.
2. THE CI workflows SHALL pin every third-party action by commit SHA and declare least-privilege `permissions`.
3. THE CI SHALL install dependencies only from committed lockfiles.
4. THE CI SHALL run `pnpm audit`, `pip-audit` and a license check over all installed dependencies, and SHALL fail on licenses outside an allowlist (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, Python-2.0, PSF-2.0). Development-only dependencies MAY also use MPL-2.0 when used unmodified. Runtime dependencies shipped in the Pages_Artifact or the engine image SHALL NOT.

### Requirement 5: GitHub Pages pipeline

**User Story:** As a judge, I want to open one public URL and find the landing page and the working demo.

#### Acceptance Criteria

1. WHEN a commit lands on `main`, THE CI SHALL build the Pages_Artifact with `mise run build:pages` and deploy it to GitHub Pages.
2. THE Pages_Artifact SHALL serve the landing page at `/` and the app at `/app/`, with every asset path correct under the repository subpath.
3. THE Pages_Artifact SHALL include the Content Security Policy from the security steering as a meta tag on every HTML page.
4. THE Pages_Artifact SHALL load no third-party scripts, styles, fonts or analytics.

### Requirement 6: Decision records and docs

**User Story:** As a future reader, I want the important decisions written down, so that nobody "fixes" them by accident.

#### Acceptance Criteria

1. THE Repository SHALL contain ADRs for: stack (0001), browser-first inference (0002), deployment tiers (0003), license choice (0004).
2. THE Repository SHALL contain `README.md`, `LICENSE` (MIT), `docs/kiro-journal.md` and `docs/model-card.md` stubs.
3. THE `README.md` SHALL link to the live demo, explain the three delivery tiers and state the project's limitations.
