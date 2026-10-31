# Model card: Doppelgänger detector

> Status: stub. No model has been selected, trained or evaluated yet. This card is filled in by the `detection-model` spec. Until then, this project makes **no** claims about detection performance.

## Model details

- Model ID and version: _TBD_
- Source checkpoint and license: _TBD_
- Architecture and input: 16 kHz mono Float32 audio in [-1, 1]; window and hop sizes from the model manifest
- Runtimes: ONNX Runtime Web (WASM, SIMD, single thread) in the browser; ONNX Runtime CPU in the Pro engine
- Output: a calibrated **dissonance score**, an estimate that a voice is synthetic. It is not accuracy, certainty or proof.

## Intended use

- Real-time, on-device warning during calls, paired with a verification protocol (code word, call back on a known number).
- Offline analysis of a recorded audio file (Autopsy mode).

## Out-of-scope use

- Identifying or verifying a speaker.
- Being the sole basis for legal, disciplinary or financial decisions.
- Generating or improving voice clones.

## Training data

_TBD: datasets, licenses, and how to obtain them. Raw datasets are not committed._

## Evaluation

_TBD: each number below comes from a reproducible `mise run model:eval` run, with its date and dataset named._

| Dataset | Codec condition | EER | ROC AUC | False-alarm rate on genuine speech at Possession threshold | Run date |
| --- | --- | --- | --- | --- | --- |
| _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

Latency per window:

| Runtime | p50 | p95 | Run date |
| --- | --- | --- | --- |
| ORT Web, single thread | _TBD_ | _TBD_ | _TBD_ |
| ORT CPU | _TBD_ | _TBD_ | _TBD_ |

## Calibration

_TBD: method (temperature scaling by default), development set, parameters stored in the model manifest._

## Known failure modes

To be measured and documented. Expected risk areas:

- Codec compression (call platforms, voice notes)
- Background noise and music
- Accents and languages under-represented in training data
- Short utterances
- TTS and voice-conversion systems not seen in training

## Ethics

Test and demo clones are made only from the author's own voice, with consent, and are labelled as synthetic. The repository contains no voice-cloning code, prompts or models.
