# Doppelgänger power

A Kiro power that lets Kiro check suspicious audio files for signs of a synthetic or cloned voice. It uses the project's own local detector, the Doppelganger MCP server. Audio is read into memory from folders you allow, is never written, and never leaves your machine.

**The result is probabilistic.** The Dissonance_Score estimates how likely a voice is to be synthetic. It is not proof, and it does not identify a person. Read the [model card](https://github.com/brennocm/doppelganger/blob/main/docs/model-card.md) for what the model can and cannot do.

**Status:** the only model in the repository today is a synthetic test model, and its scores mean nothing. Real use waits for the first evaluated light model (detection-model task 6.4).

## Contents

| File | Purpose |
| --- | --- |
| `plugin.json` | Manifest (Agent Plugins 1.0.0) with the activation keywords |
| `mcp.json` | The `doppelganger` stdio MCP server |
| `skills/doppelganger-safe-use/SKILL.md` | When to use the tools and how to report the result honestly |

## Setup

1. Clone the repository and install the toolchain: `git clone https://github.com/brennocm/doppelganger.git`, then `mise install` in the clone.
2. Set the environment variables before starting Kiro:
   - `DOPPELGANGER_REPO`: absolute path of the clone (required).
   - `DOPPELGANGER_MCP_ROOTS`: `:`-separated folders the server may read audio from (default: the clone's `apps/web/public/replay`).
   - `DOPPELGANGER_MCP_MODELS`: `:`-separated folders with model manifests (default: the clone's `apps/web/public/models`).
3. Install the power: `kiro-cli powers install <clone>/powers/doppelganger`, or in the IDE, **Powers → Add Custom Power → Import power from a folder**.

## Tools

- `analyze_audio_file(path, model_id?)`: per-window scores, peak, mean, state timeline and verdict for a WAV file.
- `list_models()`: the local models with their SHA-256 and license.
- `explain_thresholds()`: the thresholds and smoothing behind the verdict.
