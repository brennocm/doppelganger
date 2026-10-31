# Design Document

## Overview

The model lab is an offline Python toolkit. It never runs in production; it produces verified ONNX files plus manifests that the browser, engine and MCP server consume. Its first output is the go/no-go decision.

## Architecture

```text
Haunt_Set (outside repo, $HAUNT_SET_DIR) ─┐
Public benchmark ($BENCHMARK_DIR) ────────┤
                                          ▼
                 codecs.py (Opus / 8 kHz / noise, via ffmpeg in memory pipes)
                                          ▼
 candidates/*.py (load PyTorch checkpoints) ──► export.py (fp32 ONNX) ──► evaluate.py ──► reports/<date>/
                                          ▼
                 calibrate.py (temperature scaling on dev split)
                                          ▼
                 export.py (torch.onnx.export → onnxruntime quantize_dynamic → parity check)
                                          ▼
                 manifest.py → apps/web/public/models/<id>.json (+ .onnx for the light model)
                                          ▼
                 inference.py (shared ONNX Runtime inference used by engine and MCP server)
```

## Components and Interfaces

### Candidates (to verify during task 1)

| Role | Candidate | Notes to verify |
| --- | --- | --- |
| Light | AASIST-L (clovaai/aasist) | ~85k parameters; raw waveform, 64,600 samples (~4.04 s) at 16 kHz; weights and code license; ONNX export of graph attention and sinc layers |
| Light | AASIST | ~300k parameters; same input |
| Light | RawNet2 (ASVspoof baseline) | ~25M parameters; fallback if AASIST export fails |
| Pro | wav2vec2 / XLS-R based anti-spoofing checkpoints on Hugging Face | Card, license, training data (ASVspoof 2019/2021/5, In-the-Wild, MLAAD) |
| Pro | SSL front-end + AASIST back-end (published research checkpoints) | Size, license |

Known risk: models trained only on ASVspoof 2019 LA generalize poorly to modern TTS and codecs. Fine-tuning with codec augmentation is the first fallback (it can run on a free cloud GPU notebook; only the exported ONNX comes back).

### Window and hop

Window length equals the model's native input (for AASIST, 64,600 samples). Hop is 16,000 samples (1 s). Both live in the manifest.

### Evaluation

- Candidates are evaluated as ONNX files through `model_lab.inference`, the same code path the engine and MCP server use, so the reported numbers belong to the exact file that ships. A PyTorch candidate is first exported to fp32 ONNX (with the parity check); its loader in `candidates/` only builds the module and loads the checkpoint. The AASIST-L and AASIST loaders are written with the gate run (task 4.1), because they need the upstream model code (MIT) and the checkpoints.
- Datasets: the Haunt_Set from `$HAUNT_SET_DIR/index.csv`, and the ASVspoof 2019 LA eval partition from `$BENCHMARK_DIR` (protocol `ASVspoof2019_LA_cm_protocols/ASVspoof2019.LA.cm.eval.trl.txt`), optionally subsampled deterministically (`--benchmark-limit`). Files are decoded to 16 kHz mono in memory by ffmpeg.
- A clip shorter than one window is zero-padded to one window. Codec noise uses a seed derived from the item's relative path.
- ORT CPU latency is measured per window during evaluation (single thread); the ORT Web latency comes from the bench-web run and is merged with `--web-latency`.
- Splits: Haunt_Set is split by **recording session** (not by window) into dev (calibration and threshold tuning) and eval (reported numbers), so no session leaks between them.
- Metrics computed with NumPy and scikit-learn; EER by ROC interpolation.
- The latency benchmark for ORT Web uses a tiny HTML page in `packages/model-lab/bench-web/`, driven by Playwright in headless Chromium.
- The "after smoothing" false-alarm rate replays window scores through the same EMA and hysteresis as `packages/detector` (implemented in Python from the golden vectors and checked for parity).

### Calibration

Temperature scaling on the spoof logit: `p = sigmoid(z / T)` for single-logit models, `softmax(z / T)[spoof_index]` for two-class models. `T` is fit by minimizing negative log-likelihood on dev. Report ECE (15 bins).

### Export

- `torch.onnx.export`, opset 17, static shape `[1, window_samples]`, input name `waveform`, output name `logits`.
- `onnxruntime.quantization.quantize_dynamic` with int8 weights.
- Parity: 200 random fixture windows; fp32 max |Δ| ≤ 1e-3; int8 kept only if the eval AUC drop is ≤ 0.01.

## Data Models

`ModelManifest` (JSON Schema in `packages/contracts/schemas/model-manifest.json`):

```json
{
  "id": "aasist-l-codec-v1",
  "version": "1.0.0",
  "role": "light",
  "file": "aasist-l-codec-v1.int8.onnx",
  "sha256": "<hex>",
  "bytes": 123456,
  "quantization": "int8",
  "sampleRate": 16000,
  "windowSamples": 64600,
  "hopSamples": 16000,
  "input": "waveform",
  "output": "logits",
  "outputKind": "two-class-logits",
  "spoofIndex": 1,
  "calibration": { "method": "temperature", "temperature": 1.7 },
  "thresholds": { "unease": 0.4, "possession": 0.7, "release": 0.5 },
  "license": { "code": "MIT", "weights": "<verified>", "trainingData": "<verified>", "verifiedOn": "2026-11-05" },
  "source": "<repository URL and commit>"
}
```

- `role` is `light`, `pro` or `test`. `test` marks the synthetic CI model (a seeded linear layer that detects nothing). It is committed in `apps/web/public/models/` so the app pipeline can run before the gate picks the Light_Model; the UI must label it as a test model. Swapping in the real model replaces the two files and nothing else.
- `bytes` and `sha256` are both checked before a model is loaded. `url` (optional, `https://` only) points to a release asset for the Pro_Model.
- `license.trainingData` records the training-data license (Requirement 1.3).
- The JSON Schema forbids unknown fields; TS uses `parseModelManifest` from `@doppelganger/contracts`, Python the generated Pydantic model.

## Correctness Properties

### Property 1: Calibrated output is a probability

*For any* finite logit vector, the calibration function returns a value in [0, 1], and it returns an error for NaN or infinite inputs.

**Validates: Requirements 4.1**

### Property 2: Calibration is monotonic

*For any* two logit vectors whose spoof margin satisfies `a < b`, the calibrated scores satisfy `p(a) ≤ p(b)`.

**Validates: Requirements 4.1**

### Property 3: Codec simulation preserves length

*For any* 16 kHz input of N samples and any codec condition, the simulated output has exactly N samples after trim/pad. Before trimming, the codec output differs from N by at most 1 % or 960 samples (60 ms: three 20 ms Opus frames plus resampler delay), whichever is larger, because codecs work in whole frames. Empty input returns empty output without running ffmpeg; non-finite samples are rejected.

**Validates: Requirements 2.1**

### Property 4: Manifest hash integrity

*For any* exported model file, the SHA-256 recorded in its manifest equals the hash of the file bytes, and changing any byte makes verification fail.

**Validates: Requirements 5.4**

## Error Handling

- Missing `$HAUNT_SET_DIR` or `$BENCHMARK_DIR`: the command exits with a message naming the variable.
- ONNX export failure: the candidate is marked "export failed" in the report with the operator name; the next fallback is tried.
- ffmpeg missing: clear message with install hint.
- Noise at 10 dB SNR is white Gaussian noise from a seeded generator (`numpy.random.default_rng(seed)`), so evaluation stays deterministic (Requirement 2.5). A silent input gets no noise, because its SNR is undefined. Output is clipped to [-1, 1].

## Testing Strategy

- Hypothesis tests for Properties 1 to 4.
- Golden vectors for calibration written to `packages/contracts/fixtures/golden/calibration.json` and asserted in both Python and TS.
- A tiny synthetic "model" (fixed linear layer) tests the export, quantization and parity pipeline in CI without downloading real weights.
