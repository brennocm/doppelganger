# Implementation Plan

- [x] 1. Candidates and licenses
  - [x] 1.1 Research candidates (use the Hugging Face and documentation MCP servers) and write `packages/model-lab/CANDIDATES.md`
    - _Requirements: 1.1_
  - [x] 1.2 Verify code, weights and training-data licenses; mark rejected candidates with reasons
    - _Requirements: 1.2, 1.3_

- [ ] 2. Data preparation (outside the repository)
  - [x] 2.1 Document in `packages/model-lab/HAUNT_SET.md` how the Haunt_Set is recorded (sessions, sentences, devices) and how consented clones are produced, without including any cloning code or prompts
    - _Requirements: 7.1, 7.2_
  - [x] 2.2 Implement `codecs.py` (Opus 16/32 kbps, 8 kHz band, noise at 10 dB SNR) using in-memory ffmpeg pipes
    - _Requirements: 2.1_
  - [x]* 2.3 Write property test for codec simulation length
    - **Property 3: Codec simulation preserves length**
    - **Validates: Requirements 2.1**
  - [x] 2.4 Implement session-based dev/eval splitting
    - _Requirements: 2.1, 4.1_

- [ ] 3. Evaluation harness
  - [ ] 3.1 Implement the ONNX candidate loader and `evaluate.py` with EER, AUC, false-alarm and detection rates per condition
    - _Requirements: 2.1, 2.2, 2.5_
  - [ ] 3.2 Port the EMA and hysteresis logic for "after smoothing" metrics and assert parity with the golden vectors
    - _Requirements: 3.1_
  - [ ] 3.3 Implement report writing (`results.json`, `summary.md`) without raw paths
    - _Requirements: 2.4_
  - [ ] 3.4 Build `bench-web/` and the Playwright latency benchmark for ORT Web; add ORT CPU latency
    - _Requirements: 2.3_

- [ ] 4. Go/no-go gate
  - [ ] 4.1 Write the AASIST-L and AASIST checkpoint loaders in `candidates/`, export them to fp32 ONNX, run the evaluation, apply the gate, and write the ADR with the numbers
    - _Requirements: 3.1, 3.3_
  - [ ] 4.2 If the gate fails, run the fallbacks in order (codec-augmented fine-tuning first) and update the ADR
    - _Requirements: 3.2_

- [ ] 5. Calibration
  - [ ] 5.1 Implement temperature scaling, ECE reporting and the golden calibration vectors
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 5.2 Write property test for probability bounds
    - **Property 1: Calibrated output is a probability**
    - **Validates: Requirements 4.1**
  - [x]* 5.3 Write property test for monotonic calibration
    - **Property 2: Calibration is monotonic**
    - **Validates: Requirements 4.1**

- [ ] 6. Export
  - [x] 6.1 Implement `export.py` (ONNX export, int8 quantization, parity check) and test it on the synthetic CI model
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 6.2 Implement `manifest.py` and the manifest JSON Schema in `packages/contracts`
    - _Requirements: 5.4_
  - [x]* 6.3 Write property test for manifest hash integrity
    - **Property 4: Manifest hash integrity**
    - **Validates: Requirements 5.4**
  - [ ] 6.4 Export the chosen Light_Model into `apps/web/public/models/`; publish the Pro_Model as a release asset
    - _Requirements: 5.5_
  - [x] 6.5 Implement `inference.py` (shared ONNX Runtime inference for the engine and MCP server)
    - _Requirements: 5.4_

- [ ] 7. Model card and demo clips
  - [ ] 7.1 Write `docs/model-card.md` from the latest report
    - _Requirements: 6.1, 6.2_
  - [ ] 7.2 Select and commit the labelled demo clips (genuine and synthetic, each under 30 s) to `apps/web/public/replay/` with a `clips.json` index
    - _Requirements: 7.3_

- [ ] 8. Checkpoint
  - The gate ADR exists, the Light_Model loads in the benchmark page within the latency budget, and the journal records the decision.
