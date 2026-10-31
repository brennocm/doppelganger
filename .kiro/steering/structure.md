---
inclusion: always
---

# Repository structure

```text
.
├── .kiro/
│   ├── steering/            # Always-on and file-scoped guidance (this folder)
│   ├── specs/               # One folder per feature: requirements, design, tasks
│   ├── hooks/               # Agent hooks (created through Kiro)
│   ├── agents/              # Custom agents (created through Kiro)
│   └── settings/mcp.json    # MCP servers (no secrets; env var references only)
├── apps/
│   ├── web/                 # Detector PWA, served at /app/
│   ├── landing/             # Static landing page, served at /
│   └── engine/              # Pro engine (FastAPI, Docker)
├── packages/
│   ├── detector/            # Pure TS: windowing, scoring, smoothing, haunting state machine
│   ├── contracts/           # JSON Schemas + generated TS and Python types
│   ├── tokens/              # Design tokens (source JSON → CSS variables + TS)
│   ├── model-lab/           # Python: evaluation, calibration, ONNX export, model manifests
│   └── doppelganger-mcp/    # Python MCP server exposing the detector to Kiro
├── infra/
│   └── docker/              # Dockerfile, compose.yaml
├── scripts/
│   └── install.sh           # Local runtime installer (Linux and WSL2)
├── docs/
│   ├── adr/                 # NNNN-title.md decision records
│   ├── model-card.md        # What the model can and cannot do
│   ├── kiro-journal.md      # Dated log of how Kiro features were used (feeds the write-up)
│   └── prompt-history.md    # Every prompt sent to Kiro, append-only
├── .github/workflows/       # CI and Pages deploy
├── .mise.toml
├── README.md
└── LICENSE
```

## Dependency rules

- `apps/*` depend on `packages/*`; apps never import each other.
- `packages/detector` depends only on `packages/contracts`. No DOM, no Web Audio, no `onnxruntime` imports: those live behind interfaces implemented in `apps/web`.
- `packages/tokens` has no runtime dependencies.
- Python packages never import from `apps/engine`; the engine imports from `packages/model-lab` only through its published inference module.

## Naming

- Folder name equals package name (`packages/detector` → `@doppelganger/detector`).
- Feature-first inside apps: `apps/web/src/features/capture/`, `features/haunting/`, `features/protocol/`, `features/autopsy/`, `features/replay/`, `features/widget/`.
- Domain names in code: `HauntingState`, `DissonanceScore`, `ModelManifest`, `ExorcismProtocol`, `AutopsyReport`. No `utils/` or `helpers/` folders.
- Files under ~300 lines; split past ~400.

## Spec order

Specs are implemented in this order, because later ones depend on earlier ones:

1. `project-foundation`
2. `kiro-workbench` (phase A: hooks, agents, third-party MCP)
3. `detection-model`
4. `detection-core`
5. `audio-capture`
6. `haunted-ui`
7. `exorcism-protocol`
8. `autopsy-mode`
9. `local-runtime`
10. `kiro-workbench` (phase B: custom MCP server and power)
11. `landing-page`
12. `submission`
