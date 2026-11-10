# 0006 — Ship the pretrained AASIST checkpoints without the gate

- Status: accepted
- Date: 2026-11-10
- Related: `detection-model` Requirements 3.1–3.3, 5.2, 5.5, 6.1 and design P49; [ADR 0005](0005-codec-augmented-fine-tuning.md); [model card](../model-card.md)

## Context

The go/no-go gate (detection-model Requirement 3.1) compares the light model on the Haunt_Set: the author's own voice, recorded in real sessions, and consented clones of it, under call codecs. The project is being finished without those recordings, so the gate cannot run, and nothing can be fine-tuned against it (ADR 0005). Until now the app loaded a synthetic test model that detects nothing.

## Decision

- The browser loads **AASIST-L** (role `light`) and the Pro engine uses **AASIST** (role `pro`), both exported unchanged from the pinned clovaai/aasist checkpoints as fp32 ONNX. Both are MIT-licensed, and their export passes the PyTorch/ONNX parity check.
- No int8 variant ships: Requirement 5.2 keeps int8 only after a labelled AUC check.
- No temperature is fitted (T = 1.0), and the default thresholds stay.
- The app shows a note under the model name that the model was trained on studio recordings and hasn't been measured on call audio. The model card, README and landing page publish no detection numbers.
- No replay clips are bundled, because the labelled clips were to come from the same recordings.
- The end-to-end build keeps the synthetic test model, so the tests stay deterministic.

## Consequences

- The app now runs a real detector. Its accuracy on calls is unknown, and the uploaders' In-the-Wild results (about 44 % EER, not reproduced) suggest it is weak there. The on-screen note and the model card say so.
- The latency fits the budget on the reference laptop: ORT Web p95 729 ms per window against a 1 s hop (model card, 2026-11-10).
- Requirements 3.1–3.3 (the gate) and 7.2 (demo clips) stay open. Recording the Haunt_Set and running `mise run model:eval` closes them; if the gate then fails, ADR 0005 applies.

## How to revert

Point `apps/web/src/features/capture/model-choice.ts` back at `models/ci-synthetic-linear.json` and delete `release/models/`.
