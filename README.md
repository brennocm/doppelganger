# Doppelgänger

A real-time voice-clone detector that runs on your own device. It listens to the remote side of a call in a browser tab (Google Meet, Teams web, WhatsApp Web), scores each slice of speech for signs of a synthetic or cloned voice, and shows the result as an interface that stays calm while the voice sounds human and visibly "rots" when it does not. When it detects a likely clone, it tells you what to do next: don't approve anything, ask for the agreed code word, hang up and call back on a known number.

> **Status: early skeleton.** The repository, quality gates, CI and the Pages pipeline exist. The detector, the model and the UI do not exist yet. Nothing here detects anything today.

Built with Kiro for Kiroween 2026. See [`docs/kiro-journal.md`](docs/kiro-journal.md) for how.

## Live demo

**[brennocm.github.io/doppelganger](https://brennocm.github.io/doppelganger/)**

- Landing page: [/doppelganger/](https://brennocm.github.io/doppelganger/)
- App: [/doppelganger/app/](https://brennocm.github.io/doppelganger/app/)

Both are placeholder pages until the UI specs are implemented.

## Delivery tiers

| Tier | What it is | Where audio is processed |
| --- | --- | --- |
| 1. Demo | Static app on GitHub Pages. Nothing to install. | In your browser (ONNX Runtime Web in a Web Worker) |
| 2. Self-hosted | The same static build, served from your own machine on `127.0.0.1`. Works offline. | In your browser |
| 3. Pro engine (optional) | A hardened Docker container with a heavier model and Autopsy mode (analyze a recorded file), published only on `127.0.0.1` | On your machine, in the container |

In every tier, no audio, transcript or score is sent to a remote host, and audio is never written to disk. See [ADR 0002](docs/adr/0002-browser-first-inference.md) and [ADR 0003](docs/adr/0003-delivery-tiers.md).

## Limitations

- **The score is probabilistic.** It is a calibrated *dissonance score*, an estimate that a voice is synthetic. It is not proof, accuracy or certainty, and it never identifies who is speaking.
- **No evaluation results yet.** No model has been chosen or evaluated. Any number published later will come from a reproducible `mise run model:eval` run, with its date and dataset named in the [model card](docs/model-card.md).
- **Expected weak spots** (to be measured): codec compression on calls and voice notes, background noise, accents and languages missing from the training data, short utterances, and voice-cloning systems the model has never seen.
- **Browser support.** The floating widget uses Document Picture-in-Picture, which only Chromium-based browsers support; other browsers get a compact mode. Support for capturing tab audio varies by browser, and the tested browsers will be listed once capture exists.
- **A detector does not replace a verification habit.** Use it together with a code word and call-backs on known numbers.

## Run locally

Requirements: Linux or Windows with WSL2 (the platforms tested so far), plus [mise](https://mise.jdx.dev/). macOS should work, since `mise.lock` includes macOS builds, but it has not been tested. mise installs the pinned Node, pnpm, Python, uv and the other tools listed in [ADR 0001](docs/adr/0001-stack.md).

```sh
git clone https://github.com/brennocm/doppelganger.git
cd doppelganger
mise trust
mise install            # toolchain + git hooks
mise run check          # definition of done: format, lint, types, boundaries, tests
mise run build:pages    # builds dist/pages (landing at /, app at /app/)
python3 -m http.server 8788 --bind 127.0.0.1 --directory dist/pages
```

Then open `http://127.0.0.1:8788/`.

| Command | What it does |
| --- | --- |
| `mise run check` | Format check, lint, typecheck, boundary rules and tests (property tests arrive with the detector specs) |
| `mise run check:all` | `check` plus secret scan of the full history, dependency and license audit, Pages build (CI runs this) |
| `mise run fix` | Apply every auto-fix |
| `mise run test -- <package>` | Tests for one package, for example `mise run test -- packages/detector` |
| `mise run build:pages` | Build the Pages artifact; set `PAGES_BASE=/doppelganger/` for the GitHub Pages project site |

`dev`, `dev:engine`, `gen:contracts`, `model:eval` and `model:export` exist but print "not implemented yet" until their specs land.

## Repository layout

`apps/` holds the web app, the landing page and the Pro engine. `packages/` holds the detector logic, shared contracts, design tokens, the model lab and the MCP server. Specs live in [`.kiro/specs/`](.kiro/specs/) and decisions in [`docs/adr/`](docs/adr/).

## Ethics

Voice clones used for testing or the demo are made only from the author's own voice, with consent, and are labelled as synthetic. This repository contains no voice-cloning code, prompts or models.

## License

[MIT](LICENSE). Model weights and datasets keep their own licenses (see the model card and [ADR 0004](docs/adr/0004-license.md)).
