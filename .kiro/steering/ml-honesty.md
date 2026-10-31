---
inclusion: fileMatch
fileMatchPattern: "{packages/model-lab,packages/detector,apps/engine,apps/landing}/**"
---

# Machine-learning honesty rules

The detector is a probabilistic tool with known blind spots. Everything we write, show or claim must reflect that.

## Never

- Never invent or round up metrics. Every number in the UI, README, landing page, video or write-up comes from a reproducible run of `mise run model:eval`, with the run's date and dataset named.
- Never fake a detection in the demo or the video. Replay mode uses the real model on real recordings and is labelled "Replay".
- Never call the score "accuracy" or "certainty". It is a **dissonance score**: a calibrated estimate that a voice is synthetic.
- Never claim the tool identifies a person.

## Always

- Report EER, ROC AUC and the false-alarm rate on genuine speech at the Possession threshold, per dataset and per codec condition.
- Report latency (p50 and p95) per window for each runtime (ORT Web single-thread, ORT CPU).
- Keep `docs/model-card.md` current: model source, license, training data, evaluation sets, known failure modes (codec compression, noise, accents, short utterances, unseen TTS systems), intended and out-of-scope use.
- Calibrate scores on a held-out development set (temperature scaling by default) and store the calibration parameters in the model manifest.
- When a change affects scores, re-run evaluation and update the model card in the same change.

## Datasets

- Check and record the license of every dataset and checkpoint before use. If a license forbids redistribution, do not commit derived files; document how to obtain them instead.
- Raw datasets live outside the repository (paths from environment variables). Only small, consented demo samples are committed.
