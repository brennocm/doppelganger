# doppelganger-mcp

MCP server (stdio) that exposes the project's own detector to Kiro (kiro-workbench Requirement 7, design P36).

## Tools

| Tool | What it returns |
| --- | --- |
| `analyze_audio_file(path, model_id?)` | Per-window Dissonance_Scores (null without speech), peak, mean, haunting state timeline and verdict for a WAV file |
| `list_models()` | Local model manifests: ID, version, role, SHA-256, license, window and hop sizes |
| `explain_thresholds()` | Thresholds, smoothing and hysteresis behind the verdict, in plain language |

The score is probabilistic. It is not proof and it does not identify a person; see [the model card](../../docs/model-card.md).

## Safety

- Files are read only from allowlisted folders, after every symlink is resolved: `DOPPELGANGER_MCP_ROOTS` (`:`-separated), default `apps/web/public/replay`.
- WAV only, at most 20 MB and 5 minutes, decoded in memory. Nothing is written and no network request is made.
- Models come from `DOPPELGANGER_MCP_MODELS` (default `apps/web/public/models`) and are loaded only if their SHA-256 matches the manifest.
- Decoding, windowing, voice activity, scoring and the verdict are the engine's own code, shared through `model_lab.inference`. A property test checks that both give the same scores.

## Run

From the repository root:

```sh
mise x -- uv run --locked --package doppelganger-mcp python -m doppelganger_mcp
```

Register it in `.kiro/settings/mcp.json`:

```json
"doppelganger": {
  "command": "mise",
  "args": ["x", "--", "uv", "run", "--locked", "--package", "doppelganger-mcp", "python", "-m", "doppelganger_mcp"]
}
```
