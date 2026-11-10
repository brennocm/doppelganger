# Model card: Doppelgänger detector

> **Status: pretrained, not evaluated on calls.** The app ships public AASIST checkpoints exactly as their authors published them. This project has not measured how well they detect cloned voices on call audio, so it makes **no** claims about detection performance. The go/no-go gate (detection-model Requirement 3) was not run, because it needs the author's own recordings, which were never made ([ADR 0006](adr/0006-ship-pretrained-aasist.md)).

## Model details

| | Light_Model (browser) | Pro_Model (engine) |
| --- | --- | --- |
| ID and version | `aasist-l` 0.1.0 | `aasist` 0.1.0 |
| File | [`apps/web/public/models/aasist-l.fp32.onnx`](../apps/web/public/models/aasist-l.json), 648,435 bytes | [`release/models/aasist.fp32.onnx`](../release/models/aasist.json), 1,501,486 bytes |
| Parameters | 85,306 | 297,866 |
| Source | `AASIST-L.pth` from [clovaai/aasist](https://github.com/clovaai/aasist) @ `a04c9863` | `AASIST.pth` from the same commit |
| License | Code and weights MIT; training data ODC-By (attribution below) | Same |

- Architecture and input: AASIST, a graph attention network over the raw waveform. 16 kHz mono Float32 audio in [-1, 1], windows of 64,600 samples (about 4 s) every 16,000 samples (1 s).
- Export: fp32 ONNX (opset 17) by `mise run model:export -- aasist-l` (or `aasist`). The export checks PyTorch against ONNX Runtime on 200 seeded windows: max |difference| 5.84e-06 (AASIST-L) and 4.77e-06 (AASIST), under the 1e-3 limit. The int8 variant is not shipped, because Requirement 5.2 keeps it only after a labelled AUC check, and there is no labelled set.
- Runtimes: ONNX Runtime Web 1.31.1 (WASM, SIMD, single thread) in the browser; ONNX Runtime 1.31.1 CPU in the Pro engine and the MCP server.
- Output: two logits; index 0 is "spoof". The app turns them into a **dissonance score**, an estimate that a voice is synthetic. It is not accuracy, certainty or proof.
- Every file is checked against the SHA-256 in its manifest before it is loaded.

## Intended use

- Real-time, on-device warning during calls, paired with a verification protocol (code word, call back on a known number).
- Offline analysis of a recorded audio file (Autopsy mode).
- Today, mainly as a working, auditable pipeline: the detector can be swapped for a better model by replacing one manifest and its file.

## Out-of-scope use

- Identifying or verifying a speaker.
- Being the sole basis for legal, disciplinary or financial decisions.
- Generating or improving voice clones.

## Training data

Both checkpoints were trained by their authors on the ASVspoof 2019 Logical Access (LA) training partition: studio-quality English read speech (VCTK speakers) and spoofed versions from 2019-era TTS and voice-conversion systems. ASVspoof 2019 is licensed under ODC-By; attribution: *ASVspoof 2019: The 3rd Automatic Speaker Verification Spoofing and Countermeasures Challenge database*, University of Edinburgh, Centre for Speech Technology Research. This project did no training or fine-tuning, and no dataset is committed.

## Evaluation

**None by this project.** No `mise run model:eval` report exists for these models, so the landing page and README show no detection numbers.

For context only, and not reproduced here: the model uploaders report an EER of 44.45 % (AASIST-L) and 43.01 % (AASIST) on the In-the-Wild dataset of real-world deepfakes (see [`CANDIDATES.md`](../packages/model-lab/CANDIDATES.md)). An EER near 50 % is chance level. Expect these models to do much worse on calls than on their training data.

Latency per window (measured, not estimated):

| Model | Runtime | p50 | p95 | Run date | Machine |
| --- | --- | --- | --- | --- | --- |
| AASIST-L | ORT Web 1.31.1, WASM SIMD, single thread, headless Chromium (`bench-web`, 50 windows) | 714 ms | 729 ms | 2026-11-10 | Intel Core i5-1135G7 (reference laptop) |
| AASIST-L | ORT CPU 1.31.1, one thread (30 windows) | 227 ms | 231 ms | 2026-11-10 | Same |
| AASIST | ORT CPU 1.31.1, one thread (30 windows) | 293 ms | 302 ms | 2026-11-10 | Same |

The hop is 1 s, so the browser keeps up on the reference laptop. On a slower device, when p95 passes the hop, the app shows a "slow device" notice.

## Calibration

None fitted. The manifests store temperature scaling with T = 1.0, which leaves the authors' scores unchanged, because fitting a temperature needs a labelled development set (Requirement 4.1). The thresholds are the defaults: Unease 0.4, Possession 0.7, release 0.5.

## Known failure modes

Not measured. Expected, given the training data:

- Codec compression on call platforms and voice notes (Opus, narrow band). Both false alarms on real voices and missed clones are likely.
- Background noise, music and room echo, absent from the studio training data.
- Languages and accents other than the English of the training set, including Portuguese.
- Short utterances (under the 4 s window).
- TTS and voice-conversion systems newer than 2019, which the models have never heard.

## How to evaluate

Record the Haunt_Set as described in [`HAUNT_SET.md`](../packages/model-lab/HAUNT_SET.md), set `$HAUNT_SET_DIR` (and `$BENCHMARK_DIR` for a public benchmark), and run `mise run model:eval`. The report lands in `packages/model-lab/reports/<date>/`, and the landing page picks up its numbers at build time. Update this card in the same change.

## Ethics

Test and demo clones are made only from the author's own voice, with consent, and are labelled as synthetic. The repository contains no voice-cloning code, prompts or models.
