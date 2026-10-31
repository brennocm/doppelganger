# Design Document

## Overview

A polyglot monorepo: pnpm workspaces for TypeScript, a uv workspace for Python, and `mise` as the single toolchain pin and task runner. CI runs the same `mise` tasks. GitHub Pages hosts a combined static artifact built from `apps/landing` and `apps/web`.

## Architecture

```text
mise (toolchain + tasks)
 ├── pnpm workspaces ── apps/web, apps/landing, packages/detector, packages/contracts, packages/tokens
 └── uv workspace ───── apps/engine, packages/model-lab, packages/doppelganger-mcp

GitHub Actions
 ├── ci.yml     → mise run check:all (PR + main)
 └── pages.yml  → mise run build:pages → actions/upload-pages-artifact → actions/deploy-pages (main)
```

## Components and Interfaces

### `.mise.toml`

```toml
[tools]
node = "22"        # pin exact versions at implementation time
pnpm = "9"
python = "3.12"
uv = "0.5"

[tasks.check]
run = [
  "pnpm biome ci .",
  "pnpm -r typecheck",
  "pnpm boundaries",
  "uv run ruff check . && uv run ruff format --check .",
  "uv run mypy apps/engine packages/model-lab packages/doppelganger-mcp",
  "shellcheck scripts/*.sh",
  "pnpm -r test",
  "uv run pytest -q",
]
```

`check:all` adds builds, Playwright E2E, `pnpm audit`, `pip-audit`, the license check and gitleaks over the full history.

### Boundary check

`dependency-cruiser` with rules:
- `apps/*` may not import from another `apps/*`.
- `packages/detector` may import only `packages/contracts`, with no `dom`, `onnxruntime-web` or Web Audio types (`lib: ["ES2022"]` in its tsconfig enforces the no-DOM part).
- No circular dependencies.

Python: `import-linter` contracts for `packages/model-lab` must not import `apps.engine`.

### Pre-commit

`lefthook` runs in parallel: Biome on staged files, Ruff on staged files, gitleaks `protect --staged`, and a forbidden-path check (`.env*`, `*.pem`, `*.key`, `*.wav`/`*.mp3`/`*.ogg`/`*.opus` outside `apps/web/public/replay/`).

### Pages build

`mise run build:pages`:
1. `pnpm --filter landing build` → `dist/pages/`
2. `pnpm --filter web build --base=/<repo>/app/` → `dist/pages/app/`
3. Copies `404.html` and writes `dist/pages/.nojekyll`.
4. Runs `scripts/verify-pages.mjs`, which fails if any HTML lacks the CSP meta tag or references an external origin.

The base path comes from an environment variable (`PAGES_BASE`) so that the same build works on a custom domain or self-hosted at `/`.

## Data Models

None beyond configuration.

## Correctness Properties

This spec is configuration; it has no runtime properties. Its verifiable guarantees are checked by scripts:

- `verify-pages.mjs`: every HTML file in the artifact has the CSP meta tag; no `src` or `href` points to an origin other than self (the landing page's YouTube facade is the only allowlisted exception, and only `www.youtube-nocookie.com`).

## Error Handling

- Missing tool versions: `mise install` fails with the tool name.
- Boundary violations print the importing file, the imported module and the rule name.

## Testing Strategy

- A smoke test per package (`it("loads")`) so `check` exercises every workspace from day one.
- CI runs on `ubuntu-latest`; the Pages job runs only after `ci` passes on `main`.
