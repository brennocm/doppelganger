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
- The "after smoothing" false-alarm rate replays window scores through the same EMA and hysteresis as `packages/detector` (implemented in Python from the golden vectors and checked for parity). Each item is replayed as one capture: `capture-started`, then one `window-scored` per window in time order, all treated as voiced (the clips are speech). `alpha`, `confirmWindows` and `releaseWindows` use the detector defaults, and the thresholds come from the manifest. `falseAlarmRateSmoothed` is the share of genuine windows during which the machine is in Possession, and `detectionRateSmoothed` the share of synthetic windows. The gate (Requirement 3.1) uses `falseAlarmRateSmoothed`. (P24)

### Candidate loaders (task 4.1, P31)

- **Upstream code.** `candidates/upstream/aasist_model.py` is `models/AASIST.py` from clovaai/aasist at commit `a04c9863f63d44471dde8a6abcb3b082b07cd1d1`, byte for byte (MIT, NAVER Corp; the license text is next to it). A test checks its SHA-256 against the recorded value, so it can't drift silently. It is excluded from Ruff and mypy because it is third-party code kept unmodified.
- **Checkpoints.** `candidates/checkpoints.json` records, per candidate, the URL of the checkpoint at the same commit, its SHA-256 and size, the model config from the upstream `config/*.conf`, and the licenses. The GitHub files' hashes match the Hugging Face mirrors in CANDIDATES.md. `model_lab.candidates.fetch` downloads over HTTPS only into `$DOPPELGANGER_CACHE/checkpoints` (default `~/.cache/doppelganger`, outside the repository) and refuses a file whose size or SHA-256 differs. The state dict is loaded with `torch.load(weights_only=True)`. Downloads read at most the recorded size + 1 bytes, and redirects that leave HTTPS are refused. A `$DOPPELGANGER_CACHE` inside the repository is refused, so a checkpoint is never committed by accident (exorcist L4, L5).
- **Export.** The loader wraps `Model` so that it returns only the logits, and exports with `export.export_model` to fp32 ONNX: no int8 until the gate measures the AUC drop on the Haunt_Set (Requirement 5.2). The manifest has `outputKind: two-class-logits` and `spoofIndex: 0` (upstream index 1 is bona fide), temperature 1.0 until calibration, and `role: light`. The command is `mise run model:export -- aasist-l` (or `aasist`), writing to `$DOPPELGANGER_CACHE/onnx/` by default.
- **Dry run.** `mise run model:eval -- --datasets synthetic --manifest …` runs the full harness (every codec condition, the dev/eval split, calibration, smoothed rates, latency) on seeded synthetic signals. Its report is labelled "synthetic dry run, not a measurement" and must be written outside `packages/model-lab/reports/` (`--reports` is required with this dataset). It proves the pipeline runs; its numbers mean nothing.
  - Shape (P33): 8 items of 6 s (two AASIST windows each) in 4 sessions, each session with one item labelled genuine and one labelled synthetic. The signals cycle through sine, noise, silence and chirp from `model_lab.synthetic`, seeded per item. Sessions 1–2 are dev and 3–4 are eval, so calibration and the eval rows both run. The labels are arbitrary.
  - `synthetic` cannot be combined with another dataset in one run, so a dry-run label never covers real numbers. `--reports` must not resolve to a folder inside `packages/model-lab/reports/`. A `--label` is appended after the dry-run label and does not replace it.
- **What the gate run still needs:** the Haunt_Set in `$HAUNT_SET_DIR`, then `mise run model:eval -- --manifest <onnx dir>/aasist-l.json --manifest <onnx dir>/aasist.json`, the gate decision and the ADR.

### Fine-tuning fallback (task 4.2, prepared ahead of the gate, P34)

- **Command.** `uv run --locked python -m model_lab.finetune --config packages/model-lab/configs/finetune-aasist-l.json --out <folder outside the repository>`. It is not a `mise` verb: it runs only when the gate fails (Requirement 3.2), possibly on a borrowed GPU, and only the exported ONNX comes back.
- **Config.** A JSON file read into a frozen dataclass. Unknown keys and out-of-range values are refused. Fields: `candidate` (`aasist-l` or `aasist`), `init` (`pretrained` loads the pinned, verified checkpoint; `random` is for the smoke test), `dataset` (`asvspoof2019-la-train` or `synthetic`), `seed`, `epochs`, `batchSize`, `learningRate`, `weightDecay`, `classWeights` (in upstream index order, spoof then bona fide; upstream uses 0.1 and 0.9 because bona fide is the minority class in 2019 LA train), `conditions` (the Codec_Conditions used for augmentation), `maxItemsPerEpoch` (optional), `exportOnnx` and `modelId`.
- **Data.** Training uses the ASVspoof 2019 LA **train** partition from `$BENCHMARK_DIR` (protocol `ASVspoof2019.LA.cm.train.trn.txt`, ODC-By). The Haunt_Set is never used for training: its dev split calibrates and its eval split decides the gate. Audio is decoded in memory and never written.
- **Augmentation.** Each training example is a random 64,600-sample crop (zero-padded if shorter) passed through one Codec_Condition drawn from `conditions`. Crops, conditions and codec noise come from a NumPy generator seeded with `seed`, the epoch and the item, so a run is reproducible.
- **Training.** Adam with the configured learning rate and weight decay, weighted cross-entropy on the two upstream logits, and the item order shuffled by the seeded generator. `torch.manual_seed(seed)` and `torch.use_deterministic_algorithms(True)` are set. The script runs on CPU; on a GPU, determinism is best effort.
- **Outputs**, in `--out`: `model.pth` (state dict only) and `run.json` (config, seed, starting checkpoint SHA-256, per-epoch mean loss, `model.pth` SHA-256). With `exportOnnx`, it also writes `<modelId>.fp32.onnx` and its manifest through `export.export_model`, with the parity check. `--out` is refused if it resolves inside the repository, checked again right before anything is written (a symlink can appear during a long run), so weights trained on ASVspoof (ODC-By, attribution) are never committed by accident.
- **Smoke test.** On CPU, random init, `synthetic` data (the dry-run items), one epoch of two batches of two, with no export. Two runs with the same seed give identical losses and an identical `model.pth` hash. CI never trains for real and never downloads anything.

### Shipping without the gate (P49, 2026-11-10)

- The project is finished without the Haunt_Set, so the gate (task 4) is not run. The shipped models are the pinned checkpoints exported unchanged: AASIST-L as the Light_Model (role `light`, `apps/web/public/models/`) and AASIST as the Pro_Model (role `pro`, `release/models/`). `candidates.spec()` sets the role by name.
- fp32 only (no labelled set for the Requirement 5.2 int8 check), temperature 1.0, default thresholds.
- The app loads AASIST-L except in the end-to-end build (`--mode e2e`), which keeps the synthetic CI model. A role other than `test` shows a note that the model hasn't been measured on call audio.
- `bench-web` takes `BENCH_MODEL=<id>` to benchmark a committed manifest other than the CI model.
- Decision, numbers and revert path: [ADR 0006](../../../docs/adr/0006-ship-pretrained-aasist.md).

### Calibration

Temperature scaling on the spoof logit: `p = sigmoid(z / T)` for single-logit models, `softmax(z / T)[spoof_index]` for two-class models. `T` is fit by minimizing negative log-likelihood on dev. Report ECE (15 bins).

### Export

- `torch.onnx.export`, opset 17, static shape `[1, window_samples]`, input name `waveform`, output name `logits`.
- `onnxruntime.quantization.quantize_dynamic` with int8 weights.
- Parity: 200 random fixture windows; fp32 max |Δ| ≤ 1e-3; int8 kept only if the eval AUC drop is ≤ 0.01. Both PyTorch and ONNX Runtime run the windows one at a time: a single batch of 200 AASIST windows needs several GB of activations and swaps on a 16 GB laptop. (P32)

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
