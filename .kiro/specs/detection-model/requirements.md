# Requirements Document

## Introduction

This spec chooses, evaluates, calibrates and exports the voice-clone detection models. It produces two ONNX models: a **light model** that runs in the browser on a modest laptop (reference machine: Intel Core i5-1135G7, 4 cores, no discrete GPU) and a **pro model** for the local engine. Its first job is a go/no-go gate: if the candidates cannot separate the author's real voice from clones of it under call-like conditions, the project changes course before any UI work.

## Glossary

- **Model_Lab**: the Python package `packages/model-lab`.
- **Light_Model**: the browser model (target: AASIST-L class, a few MB).
- **Pro_Model**: the engine model (target: wav2vec2/XLS-R based detector, int8).
- **Haunt_Set**: the private evaluation set: the author's genuine recordings plus clones of the author's voice from at least two different cloning systems, all passed through codec conditions.
- **Codec_Conditions**: clean 16 kHz; Opus at 16 kbps and 32 kbps; 8 kHz telephone band; added background noise at 10 dB SNR.
- **Model_Manifest**: the JSON description of a model, defined in `packages/contracts`.
- **Dissonance_Score**: a calibrated probability in [0, 1] that a window contains synthetic speech, shown to users as 0 to 100.

## Requirements

### Requirement 1: Candidate selection and licensing

**User Story:** As the author, I want a short list of candidate models with verified licenses, so that I can ship them legally.

#### Acceptance Criteria

1. THE Model_Lab SHALL document at least two Light_Model candidates and at least two Pro_Model candidates in `packages/model-lab/CANDIDATES.md`, each with source, parameter count, input format, training data and license.
2. WHEN a candidate's weights or training data license forbids redistribution or commercial-style public demos, THE Model_Lab SHALL mark the candidate as rejected with the reason.
3. THE Model_Lab SHALL record license verification for every shipped model in its Model_Manifest.

### Requirement 2: Evaluation harness

**User Story:** As the author, I want a reproducible evaluation, so that every number we publish can be regenerated.

#### Acceptance Criteria

1. WHEN `mise run model:eval` runs, THE Model_Lab SHALL evaluate every candidate on the Haunt_Set under every Codec_Condition, and on at least one public spoofing benchmark whose license allows evaluation use.
2. THE Model_Lab SHALL report, per model and condition: EER, ROC AUC, the false-alarm rate on genuine windows at the possession threshold, and the detection rate on synthetic windows at that threshold.
3. THE Model_Lab SHALL report inference latency p50 and p95 per window for ONNX Runtime CPU and for ONNX Runtime Web (single-thread WASM SIMD, measured in a headless Chromium benchmark page).
4. THE Model_Lab SHALL write results to `packages/model-lab/reports/<date>/results.json` and a human-readable `summary.md`; raw audio paths SHALL come from environment variables and SHALL NOT be written to reports.
5. THE evaluation SHALL be deterministic for the same inputs and model.

### Requirement 3: Go/no-go gate

**User Story:** As the author, I want an explicit decision point, so that I don't build a beautiful UI on a detector that doesn't work.

#### Acceptance Criteria

1. THE Model_Lab SHALL define the gate as: on the Haunt_Set with Opus 16 kbps, the Light_Model reaches ROC AUC ≥ 0.85 and a genuine-window false-alarm rate ≤ 5% at the possession threshold after smoothing.
2. WHEN no Light_Model candidate passes the gate, THE Model_Lab SHALL evaluate the documented fallbacks in order: fine-tuning the best candidate on codec-augmented data, using the Pro_Model in the browser at reduced frequency, or making the Pro engine the primary demo.
3. THE gate decision and its numbers SHALL be recorded in an ADR.

### Requirement 4: Calibration

**User Story:** As a user, I want a score that means the same thing across models, so that the thresholds stay meaningful.

#### Acceptance Criteria

1. THE Model_Lab SHALL fit temperature scaling for each shipped model on a development split separate from the evaluation split.
2. THE Model_Manifest SHALL store the calibration method and parameters.
3. THE Model_Lab SHALL report expected calibration error before and after calibration.

### Requirement 5: Export and verification

**User Story:** As a developer, I want verified ONNX files, so that the browser and engine run exactly what was evaluated.

#### Acceptance Criteria

1. WHEN `mise run model:export` runs, THE Model_Lab SHALL export each shipped model to ONNX with a fixed input length equal to its window size.
2. THE Model_Lab SHALL produce an int8 dynamically quantized variant and SHALL keep it only if its AUC drop on the Haunt_Set is ≤ 0.01 versus fp32.
3. THE Model_Lab SHALL verify output parity between PyTorch and ONNX Runtime (max absolute difference ≤ 1e-3 on fp32 logits).
4. THE Model_Lab SHALL write a Model_Manifest per model with ID, version, SHA-256, sample rate, window and hop samples, input and output names, output kind, spoof index, calibration, default thresholds, license and source.
5. THE Light_Model file SHALL be ≤ 10 MB and SHALL be committed under `apps/web/public/models/`; the Pro_Model SHALL be published as a GitHub Release asset referenced by its manifest.

### Requirement 6: Model card

**User Story:** As a judge or user, I want to know what the model can and cannot do.

#### Acceptance Criteria

1. THE Repository SHALL contain `docs/model-card.md` with model sources, licenses, training data, evaluation results with dates, calibration, intended use, out-of-scope use and known failure modes.
2. WHEN evaluation results change, THE model card SHALL be updated in the same change.

### Requirement 7: Consent and data handling

**User Story:** As the author, I want the evaluation data handled ethically.

#### Acceptance Criteria

1. THE Haunt_Set SHALL contain clones only of the author's own voice, made with consent.
2. THE Repository SHALL NOT contain voice-cloning code, cloning prompts or raw Haunt_Set audio.
3. THE Repository SHALL contain only the short, labelled demo clips selected for replay mode, each under 30 seconds.
