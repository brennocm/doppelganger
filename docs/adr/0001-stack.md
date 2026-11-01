# 0001 — Stack and pinned versions

- Status: accepted
- Date: 2026-10-30
- Spec: `project-foundation` (Requirements 1.1, 2.2, 3.1, 4.2, 4.3)

## Context

Doppelgänger is a polyglot monorepo. A TypeScript web app runs inference in the browser, and Python covers the model lab, the optional Pro engine and the MCP server. A developer, Kiro and CI must run exactly the same tools at the same versions, and a clean clone must pass `mise install && mise run check`.

## Decision

- **mise** pins every command-line tool and is the only task runner (`mise run <verb>`). `mise.lock` records per-platform download URLs and SHA-256 checksums, and CI installs with `MISE_LOCKED=1`.
- **pnpm workspaces** hold the TypeScript packages and **a uv workspace** holds the Python packages. Each has one committed lockfile (`pnpm-lock.yaml`, `uv.lock`), and installs are always frozen (`pnpm install --frozen-lockfile`, `uv sync --locked`).
- One formatter and one linter per language: **Biome** (TS, JS, JSON; never Markdown), **Ruff** (Python), **ShellCheck** (shell).
- Types: **TypeScript** strict with `noUncheckedIndexedAccess`, and **mypy** `--strict`.
- Boundaries: **dependency-cruiser** (TS) and **import-linter** (Python).
- Supply chain: **gitleaks** in pre-commit (**lefthook**) and in CI, plus `pnpm audit`, **pip-audit** and a license policy check (`scripts/check_licenses.py`).
- Every version is exact. Version ranges are never used. Both mise and pnpm refuse versions published less than 24 hours ago (mise default `minimum_release_age = 24h`, and `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`). This limits exposure to compromised releases that get pulled shortly after publishing.

### Pinned versions

Versions were checked against the official sources on 2026-10-30: nodejs.org `dist/index.json`, the npm registry, PyPI, python.org, and the GitHub releases API.

| Tool | Version | Where pinned | Why this version |
| --- | --- | --- | --- |
| mise | ≥ 2026.10.21 (`min_version`); CI uses 2026.10.21 | `.mise.toml`, workflows | The version this repository was set up and tested with. 2026.10.24 was hours old and is held back by the 24 h rule. |
| Node.js | 26.13.0 | `.mise.toml`, `engines` | Newest LTS line (26, "Lithium"). It is inside the supported range of Vite 8 (`>=22.12`), Vitest 5 (`^22.12 \|\| ^24 \|\| >=26`) and dependency-cruiser 18 (`^22 \|\| ^24 \|\| >=26`). |
| pnpm | 12.16.1 | `.mise.toml`, `packageManager`, `engines` | Latest stable. Its settings `allowBuilds`, `trustPolicy`, `blockExoticSubdeps` and strict `minimumReleaseAge` are used. |
| Python | 3.12.16 | `.mise.toml`, `requires-python ==3.12.*` | The tech steering fixes Python 3.12; 3.12.16 is its newest patch release. |
| uv | 0.13.6 | `.mise.toml`, `required-version` | Latest stable. `uv_build` matches it. |
| ShellCheck | 0.11.0 | `.mise.toml` | Latest release. |
| gitleaks | 8.30.1 | `.mise.toml` | Latest release. Uses `gitleaks git --pre-commit --staged`, because `protect` is not part of this CLI. |
| lefthook | 2.2.2 | `.mise.toml`, `min_version` | Latest release. |
| TypeScript | 6.0.3 | `package.json` (root and each package) | See "Why TypeScript 6, not 7" below. |
| Biome | 2.6.4 | `package.json` | Latest stable. |
| Vite | 8.3.5 | `apps/*`, `packages/*` | Latest stable, and Vitest 5's peer dependency. |
| Vitest | 5.0.5 | `apps/*`, `packages/*` | Latest stable. |
| dependency-cruiser | 18.7.0 | `package.json` | Latest stable. Supports TypeScript `>=2 <7`. |
| Ruff | 0.17.3 | `pyproject.toml` dev group | Latest stable. |
| mypy | 2.4.1 | `pyproject.toml` dev group | Latest stable. |
| pytest | 9.2.0 | `pyproject.toml` dev group | Latest stable. |
| import-linter | 2.15 | `pyproject.toml` dev group | Latest stable. |
| pip-audit | 2.10.1 | `pyproject.toml` dev group | Latest stable. Audits the hashed `uv export` of `uv.lock` without resolving anything. |
| uv_build | 0.13.6 | each member's `[build-system]` | Same version as uv. |
| NumPy | 2.5.4 | `packages/model-lab` dependencies | Latest stable (2026-10-31). Runtime dependency of the shared inference module. |
| onnxruntime | 1.31.1 | `packages/model-lab` dependencies | Latest stable (2026-10-31). CPU inference for the model lab, engine and MCP server (detection-model). |
| scikit-learn | 1.9.1 | `packages/model-lab` extra `lab` | Latest stable. ROC, AUC and EER in the evaluation harness. |
| onnx | 1.23.2 | `packages/model-lab` extra `lab` | Latest stable. Needed by `quantize_dynamic` and to inspect exported graphs. |
| PyTorch | 2.15.0 (`+cpu`) | `packages/model-lab` extra `lab`, CPU index `download.pytorch.org/whl/cpu` | Latest stable. Loads candidate checkpoints and exports them. The CPU index avoids several GB of CUDA wheels. Export uses the TorchScript exporter (`dynamo=False`), which needs no `onnxscript`. |
| Hypothesis | 6.170.14 | root `dev` group | Latest stable. Property-based tests (MPL-2.0, development only, unmodified). |
| json-schema-to-typescript | 16.0.0 | `packages/contracts` devDependencies | Latest stable (MIT). Generates the TS types in `gen:contracts`. |
| datamodel-code-generator | 0.87.0 | root `dev` group | Latest stable (MIT). Generates the Pydantic models in `gen:contracts`. |
| Pydantic | 2.14.2 | `packages/contracts` (Python) dependencies | Latest stable (MIT). Runtime validation of manifests and engine messages. |
| onnxruntime-web | 1.31.1 | `packages/model-lab/bench-web` dependencies | Latest stable (MIT, 2026-10-26). Same release as the Python `onnxruntime`. The bench page loads `ort.wasm.min.mjs` and its WASM files from the package's `dist/` through a 127.0.0.1 test server, never from a CDN. Its dependency `protobufjs` has a `postinstall` that only prints a version-scheme warning, so `allowBuilds` sets it to `false`. |
| @playwright/test | 1.64.1 | `packages/model-lab/bench-web` devDependencies | Latest stable (Apache-2.0). Drives headless Chromium for the ORT Web latency benchmark; CI installs the matching Chromium with `playwright install --with-deps chromium`. |
| @types/node | 26.6.6 | `packages/model-lab/bench-web` devDependencies | Latest stable (MIT). Types for the benchmark's Node test server. |
| fast-check | 4.10.2 | `packages/detector` devDependencies | Latest stable (MIT, 2026-09-19). Property-based tests in TS; every property runs 200 times with a fixed seed (`packages/detector/src/property-runs.ts`). |
| github-mcp-server | 2.0.3 | `.mise.toml` (`github:` backend), `mise.lock` | Official GitHub MCP server (MIT), run locally over stdio so the version is pinned and checksum-verified, unlike the hosted endpoint. Started with `--toolsets=repos,issues,pull_requests --lockdown-mode`. |
| @playwright/mcp | 0.0.83 | `.kiro/settings/mcp.json` (`npx -y`, exact version) | Microsoft's Playwright MCP server (Apache-2.0), latest release. It depends on a Playwright 1.64 alpha build, which is how Microsoft ships it. Runs `--headless --isolated --browser chromium`. |
| @upstash/context7-mcp | 4.4.4 | `.kiro/settings/mcp.json` (`npx -y`, exact version) | Context7 documentation server (MIT), latest release. Works without an API key; reads `CONTEXT7_API_KEY` from the environment when set. |
| actions/checkout | v7.0.1 (`3d3c42e5…`) | workflows | Latest release, pinned by commit SHA. |
| jdx/mise-action | v5.2.4 (`6be3c7ed…`) | workflows | Latest release, pinned by commit SHA. |
| actions/configure-pages | v6.0.0 (`45bfe019…`) | `pages.yml` | Latest release, pinned by commit SHA. |
| actions/upload-pages-artifact | v5.0.0 (`fc324d35…`) | `pages.yml` | Latest release, pinned by commit SHA. Needs `include-hidden-files: true` to keep `.nojekyll`. |
| actions/deploy-pages | v5.0.1 (`368f8252…`) | `pages.yml` | Latest release, pinned by commit SHA. |

The MCP servers started with `npx -y <package>@<version>` are pinned to an exact version but are not in `pnpm-lock.yaml`, so they get no lockfile integrity check, no 24 h release-age delay and no license-policy check; their licenses were checked by hand. The Hugging Face server is the hosted endpoint `https://huggingface.co/mcp`, which has no version to pin.

The rest of the stack in the tech steering (FastAPI, Uvicorn, the MCP SDK) is not installed yet. Each spec that first needs one of them pins it and adds a row to this table.

The `lab` extra is installed by the root `dev` group, so `mise run check` and CI test the export pipeline, while the engine image installs `doppelganger-model-lab` without it. NumPy (Zlib in its expression) and PyTorch (BSL-1.0, Zlib and `Apache-2.0 WITH LLVM-exception`) required adding those three permissive IDs to the license allowlist (project-foundation Requirement 4.4).

### Why TypeScript 6, not 7

TypeScript 7.0.2 was the latest stable release on 2026-10-30. It is the native (Go) compiler, and its JavaScript API is published only under `typescript/unstable/*`. Tools that read TypeScript through the compiler API do not support it yet. dependency-cruiser 18.7.0 declares `typescript >=2.0.0 <7.0.0` and warns that it would miss TypeScript sources. The boundary check is a requirement (2.3), so it must use its normal parser.

An earlier attempt kept TypeScript 7 and made dependency-cruiser parse with `@swc/core`. That was reverted: it added a native dependency with a build script, and it found fewer dependencies (5 modules and 0 dependencies, against 10 and 5 with the TypeScript parser).

**Move to TypeScript 7 when both of these hold:**

1. dependency-cruiser releases a version whose `supportedTranspilers.typescript` range includes 7.x, and
2. every other tool in the repository that reads TypeScript through its API at that point (for example a future codegen step in `gen:contracts`) supports 7.x.

The upgrade must keep `mise run check` green, and it updates this ADR.

## Alternatives considered

- **Several tools for versions and tasks** (nvm or Volta, pyenv, Make or npm scripts). Rejected: each language would have its own pins and its own entry points, so Kiro, developers and CI could drift apart.
- **Turborepo or Nx for orchestration.** Rejected for now: the repository is small and mise tasks are enough. They would add a dependency and a second task language.
- **ESLint and Prettier instead of Biome.** Rejected: two tools and many plugins, where Biome is one pinned binary.
- **Poetry or pip-tools instead of uv.** Rejected: the tech steering chose uv, and a uv workspace gives all three Python packages one shared lockfile.
- **Version ranges with lockfiles only.** Rejected: an exact pin makes every upgrade a visible diff.
- **TypeScript 7 with `@swc/core` for dependency-cruiser.** Tried and reverted; see above.

## Consequences

- A clean clone needs only mise. `mise install` installs the toolchain and the git hooks, and `mise run check` installs dependencies from the lockfiles before running.
- Upgrades are deliberate: change the pin, refresh the lockfile, run `mise run check:all`, and update this table.
- A brand-new release cannot be installed during its first 24 hours, even on purpose, unless the pin is excluded explicitly.
