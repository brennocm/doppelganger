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

Every tool is pinned to an exact version, and `mise.lock` records per-platform download checksums. The pinned versions and the reasons for them are in `docs/adr/0001-stack.md`. Node, pnpm, Python, uv, ShellCheck, gitleaks and lefthook come from mise. TypeScript, Biome, Vitest and dependency-cruiser are pinned dev dependencies in `package.json`. Ruff, mypy, pytest, import-linter and pip-audit are pinned in the root `pyproject.toml` dev group.

```toml
[tasks.check]
depends = ["deps"]   # pnpm install --frozen-lockfile; uv sync --locked
run = [
  "pnpm exec biome ci .",
  "pnpm -r run typecheck",
  "pnpm --silent boundaries",
  "uv run --locked ruff check .",
  "uv run --locked ruff format --check .",
  "uv run --locked mypy apps/engine/src packages/model-lab/src packages/doppelganger-mcp/src",
  "uv run --locked lint-imports --no-cache",
  { task = "lint:shell" },   # ShellCheck on every tracked *.sh
  "scripts/test.sh",         # pnpm -r run test; uv run pytest -q
]
```

`check` installs dependencies from the committed lockfiles before it runs, so a clean clone needs only `mise install && mise run check`.

`check:all` adds the forbidden-path check over every tracked file, gitleaks over the full history, `pnpm audit`, `pip-audit`, the license check, builds and Playwright E2E.

Biome formats and lints code and JSON only. It never touches Markdown: files under `.kiro/` and `docs/` are written by hand, and `docs/prompt-history.md` is append-only.

### TypeScript version

TypeScript is pinned to the 6.x line (6.0.3), not 7.x. TypeScript 7 is the native compiler, and its JavaScript API is not stable yet, so tools that parse TypeScript through the compiler API (dependency-cruiser among them) do not support it. ADR 0001 records the conditions for moving to 7.

### Boundary check

`dependency-cruiser` with its default TypeScript parser and these rules:
- `apps/*` may not import from another `apps/*`.
- `packages/detector` may import only `packages/contracts`, with no `dom`, `onnxruntime-web` or Web Audio types (`lib: ["ES2022"]` in its tsconfig enforces the no-DOM part).
- No circular dependencies.

Python: `import-linter` contracts for `packages/model-lab` must not import `apps.engine`.

### Pre-commit

`lefthook` runs in parallel: Biome on staged files, Ruff on staged files, `gitleaks git --pre-commit --staged`, and a forbidden-path check (`scripts/check-forbidden-paths.sh`: `.env*` except `.env.example`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, and audio files outside `apps/web/public/replay/`). Every job runs through `mise x --`, so the hook uses the pinned toolchain even when mise is not activated in the committing shell. `mise install` installs the hook (`[hooks] postinstall`).

### Dependency audit and license check

`check:all` runs `pnpm audit` and `pip-audit`. `pip-audit` reads a hashed requirements file exported from `uv.lock` (`uv export --locked --all-groups`), so it audits exactly the locked versions without resolving anything.

`scripts/check_licenses.py` (standard library only) checks every installed npm and Python dependency against `scripts/license-policy.toml`:

- The license comes from the package's SPDX expression: `license` in `package.json`, or `License-Expression` (PEP 639) in Python metadata. `AND`, `OR` and parentheses are evaluated. `<id> WITH <exception>` is one ID and must appear in the allowlist as written (only `Apache-2.0 WITH LLVM-exception` today).
- A package that reports only a license category or free text (for example the classifier "BSD License") must have an entry in the policy's override list, keyed by `name==version`, with the SPDX ID and a comment citing the project's license file URL. A version bump therefore forces the override to be checked again.
- Runtime dependencies (`pnpm licenses list --prod`, and `uv export --no-dev`) must use the base allowlist. Development-only dependencies may also use MPL-2.0.
- A package whose license is unknown, or outside the allowlist that applies to it, fails the check with its name, version and license.
- **P40 (2026-11-02):** MIT-0 (MIT No Attribution) joins the allowlist. It is MIT without the attribution condition, so it grants strictly more than MIT. It arrived with `cffi` 2.1.1, through `cryptography` ← `pyjwt[crypto]` ← `mcp` (the MCP server).

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
  - **P39:** the exception is navigation links. The landing page must link to the repository (landing-page Requirements 3.3 and 6.1), and a link the visitor clicks loads nothing by itself, so Requirement 5.4 still holds. An `href` on an `<a>` element may point to an `https://` URL. Every resource-loading attribute is still limited to self: `src`, `srcset` and `poster`, `href` on `<link>` or any other element, `action` and `formaction`. Plain `http://` links are refused.

## Error Handling

- Missing tool versions: `mise install` fails with the tool name.
- Boundary violations print the importing file, the imported module and the rule name.

## Testing Strategy

- A smoke test per package (`it("loads")`) so `check` exercises every workspace from day one.
- CI runs on `ubuntu-latest`; the Pages job runs only after `ci` passes on `main`.
