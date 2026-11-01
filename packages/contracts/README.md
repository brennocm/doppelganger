# @doppelganger/contracts

JSON Schemas shared by TypeScript and Python, the types generated from them, and the golden test vectors.

- `schemas/*.schema.json`: the source of truth (`ModelManifest`, `DetectorConfig`, `DetectorUpdate`, `SessionStats`).
- `src/generated/`: TypeScript types. `src/doppelganger_contracts/generated/`: Pydantic models (Python package `doppelganger-contracts`). Both are written by `mise run gen:contracts`; never edit them by hand. The `contracts-codegen` hook regenerates them when a schema is saved.
- `src/manifest.ts`: `parseModelManifest`, a dependency-free validator for untrusted manifest JSON. A test keeps its fields equal to the schema's.
- `fixtures/golden/*.json`: golden vectors asserted by both the TS and Python test suites. `calibration.json` and `windowing.json` come from Python: rewrite them with `uv run --locked python -m model_lab.golden`, then `mise run fix`. `haunting.json` (smoothing and state machine) comes from TS: rewrite it with `pnpm --filter @doppelganger/detector exec vitest run -u`; Biome does not format it.
