# Detection model candidates

detection-model Requirement 1.1. Researched on 2026-10-31 with the Hugging Face MCP server (`hub_repo_search`, `hf_fs`, `hub_repo_details`) and the GitHub license API. Each Hub revision is pinned below, so a later change to a model repository cannot silently change what we evaluate.

Searches: "anti-spoofing" returned only face, text and video models. The speech-specific queries "audio deepfake detection", "AASIST", "ASVspoof", "RawNet2" and "deepfake speech wav2vec2" found the candidates below.

> **About the numbers in this file.** The EER figures are reported by each model's uploader or by the third-party Speech Anti-Spoofing Arena. This project has not reproduced them. They are used only to choose what to evaluate, and they must never appear in the UI, README, landing page or write-up (ml-honesty steering). Our own numbers will come from `mise run model:eval` on the Haunt_Set.

## Light_Model candidates (browser, ≤ 10 MB)

| Candidate | Source (pinned) | Parameters | Input | Output | Training data | Size |
| --- | --- | --- | --- | --- | --- | --- |
| **AASIST-L** | [SpeechAntiSpoofingBenchmarks/AASIST-L](https://hf.co/SpeechAntiSpoofingBenchmarks/AASIST-L) @ `357e022c`, a mirror of the upstream checkpoint from [clovaai/aasist](https://github.com/clovaai/aasist) | 85,306 | Raw waveform, 16 kHz mono float32, 64,600 samples (~4.04 s) | 2 logits; index 1 = bona fide | ASVspoof 2019 LA train | `AASIST-L.pth` 426 KB; uploader's ONNX 766 KB |
| **AASIST** | [SpeechAntiSpoofingBenchmarks/AASIST](https://hf.co/SpeechAntiSpoofingBenchmarks/AASIST) @ `16774d45`, a mirror of the upstream clovaai/aasist checkpoint | 297,866 | Same as AASIST-L | Same | ASVspoof 2019 LA train | `AASIST.pth` 1.3 MB; uploader's ONNX 1.6 MB |
| LCNN v7 (CQT) | [caa-speech-detection-asvspoof2019/lcnn-v7-cqt](https://hf.co/caa-speech-detection-asvspoof2019/lcnn-v7-cqt) @ `61375c78` | ~300 k (card) | CQT spectrogram computed from 16 kHz audio, up to 4 s | 2 logits; index 0 = spoof | ASVspoof 2019 LA train, no augmentation | not checked |
| RawNet2 (ASVspoof 2021 baseline) | [eurecom-asp/rawnet2-antispoofing](https://github.com/eurecom-asp/rawnet2-antispoofing) | ~25 M (design) | Raw waveform | 2 logits | ASVspoof 2019 LA train | No official pretrained weights found; only third-party uploads |

Known risk, shared by every light candidate: they are trained only on ASVspoof 2019 LA. The uploaders report poor generalization to real-world speech: In-the-Wild EER 44.45 % (AASIST-L), 43.01 % (AASIST) and 33.41 % (LCNN v7). Given that, the go/no-go gate (Requirement 3.1) may well fail with off-the-shelf weights. Codec-augmented fine-tuning (Requirement 3.2, first fallback) should be planned now, not after the gate fails.

## Pro_Model candidates (local engine)

| Candidate | Source (pinned) | Parameters | Input | Output | Training data | Size |
| --- | --- | --- | --- | --- | --- | --- |
| **W2V2-AASIST** (XLS-R 300M + AASIST) | [SpeechAntiSpoofingBenchmarks/W2V2-AASIST](https://hf.co/SpeechAntiSpoofingBenchmarks/W2V2-AASIST) @ `196128e5`, a mirror of `LA_model.pth` from [TakHemlata/SSL_Anti-spoofing](https://github.com/TakHemlata/SSL_Anti-spoofing); the architecture is built from [facebook/wav2vec2-xls-r-300m](https://hf.co/facebook/wav2vec2-xls-r-300m) @ `1a640f32` | 317,837,800 | Raw waveform, 16 kHz mono, 64,600 samples | 2 logits; index 1 = bona fide | Fine-tuned on ASVspoof 2019 LA with RawBoost augmentation. XLS-R pretraining: 436 k hours of unlabelled speech (VoxPopuli, MLS, CommonVoice, BABEL, VoxLingua107) | 1.3 GB fp32 |
| SSL-AASIST (ShiftySpeech) | [ash56/ssl-aasist](https://hf.co/ash56/ssl-aasist) | not stated | Raw waveform, 16 kHz, 64,600 samples | 2 logits; index 1 = bona fide | WaveFake HiFiGAN samples from LJSpeech (one speaker, one vocoder) | not checked |
| Spectra-AASIST | [lab260/Spectra-AASIST](https://hf.co/lab260/Spectra-AASIST) @ `eb65c266` | 316.0 M | Raw waveform, preemphasis, 64,600 samples | 2 logits; index 0 = spoof | **Not disclosed** | 1.3 GB |
| Spectra-AASIST3 | [lab260/Spectra-AASIST3](https://hf.co/lab260/Spectra-AASIST3) @ `bc0ded88` | ~319 M | Raw waveform, preemphasis 0.97, 64,600 samples | 2 logits; index 1 = bona fide | **Not disclosed** | 1.3 GB |
| AASIST3 | [lab260/AASIST3](https://hf.co/lab260/AASIST3) @ `f0e9f100` | 321.7 M | Raw waveform | 2 logits | MLAAD, ASVspoof 5, ASVspoof 2019 LA (card tags) | not checked |
| wav2vec2-base "Deepfake-audio-detection" | [mo-thecreator/Deepfake-audio-detection](https://hf.co/mo-thecreator/Deepfake-audio-detection) @ `e4d9874b` | 94.6 M | 16 kHz waveform (transformers feature extractor) | Classifier logits | **Not disclosed** (card: "the None dataset") | not checked |

Uploader-reported In-the-Wild EER, not reproduced, for comparison only: W2V2-AASIST 11.22 %, Spectra-AASIST 1.46 %, Spectra-AASIST3 1.20 %, AASIST3 29.72 %.

All candidates share the 64,600-sample window (~4.04 s), which matches the design's default window. The hop (16,000 samples) is our choice and lives in the manifest.

## Public benchmarks for Requirement 2.1

| Benchmark | Source | License |
| --- | --- | --- |
| ASVspoof 2019 LA (eval) | [SpeechAntiSpoofingBenchmarks/ASVspoof2019_LA](https://hf.co/datasets/SpeechAntiSpoofingBenchmarks/ASVspoof2019_LA); original at asvspoof.org | ODC-By (packaging states the original was not modified) |
| ASVspoof 5 (track 1, eval) | [SpeechAntiSpoofingBenchmarks/ASVspoof5](https://hf.co/datasets/SpeechAntiSpoofingBenchmarks/ASVspoof5) | ODC-By 1.0 |

ASVspoof 2019 LA is in-domain for every light candidate, so it shows little. ASVspoof 5 includes codec conditions and is the more useful public check. Both stay outside the repository, under `$BENCHMARK_DIR`.

## License verification (Requirements 1.2 and 1.3)

Checked on 2026-10-31. "Verified" means the license text or license field was read at the source given; nothing was taken from memory. A candidate is **rejected** when a license forbids redistribution or public demos, or when the license of its weights or training data cannot be established.

| Candidate | Code | Weights | Training data | Status |
| --- | --- | --- | --- | --- |
| AASIST-L | MIT: clovaai/aasist `LICENSE` (GitHub license API) | MIT: the mirror's `LICENSE` is the NAVER Corp. MIT text, inherited from clovaai/aasist, which ships the pretrained models | ASVspoof 2019 LA: ODC-By, attribution required | **Accepted** |
| AASIST | MIT (same) | MIT (same) | ASVspoof 2019 LA: ODC-By | **Accepted** |
| LCNN v7 (CQT) | **Not verified**: the source repository has no license file (GitHub license API) | MIT (Hub metadata) | ASVspoof 2019 LA: ODC-By | **Rejected**: the model code needed to run the weights has no license. Can be reconsidered if the repository adds one. |
| RawNet2 | MIT: eurecom-asp/rawnet2-antispoofing `LICENSE` | No official pretrained weights | ASVspoof 2019 LA: ODC-By | **Fallback only**: usable if we train it ourselves |
| W2V2-AASIST | MIT: TakHemlata/SSL_Anti-spoofing `LICENSE`; fairseq MIT | MIT (mirror license field; upstream repository MIT). XLS-R 300M base: Apache-2.0 (`facebook/wav2vec2-xls-r-300m` card) | Fine-tuning: ASVspoof 2019 LA, ODC-By. XLS-R pretraining includes BABEL (LDC-licensed audio); this governs Meta's pretraining data, not the Apache-2.0 weights Meta released | **Accepted** |
| SSL-AASIST (ShiftySpeech) | Apache-2.0 (Hub metadata, revision `6be33672`) | Apache-2.0 (Hub metadata) | WaveFake: dataset CC-BY-SA-4.0 (Zenodo record 5642694), code MIT; built from LJSpeech | **Pending**: ShareAlike might extend to weights trained on it, which is legally unclear. The model also loads with `trust_remote_code=True`; we would use our own network definition instead. Evaluation only, not shipped unless resolved. |
| Spectra-AASIST | Not stated separately | **Conflicting**: Hub metadata says Apache-2.0, the README "License" section says MIT | **Not disclosed** | **Rejected**: training-data license cannot be checked, and the two license statements disagree |
| Spectra-AASIST3 | Not stated separately | Apache-2.0 (Hub metadata and README) | **Not disclosed** (pre-release, unpublished) | **Rejected**: training-data license cannot be checked |
| AASIST3 | Not stated separately | **CC-BY-NC-4.0** (Hub metadata); the README badge says CC BY-NC-ND 4.0 | MLAAD (gated, license not readable), ASVspoof 5, ASVspoof 2019 LA | **Rejected**: non-commercial, and "ND" forbids derivatives; an exported or quantized ONNX file is a derivative |
| wav2vec2-base "Deepfake-audio-detection" | Apache-2.0 (Hub metadata) | Apache-2.0 | **Not disclosed** | **Rejected**: training-data license cannot be checked |

Public benchmarks: ASVspoof 2019 LA and ASVspoof 5 are both ODC-By, which allows evaluation use and redistribution with attribution. Neither is redistributed by this project.

### Obligations for the accepted candidates

- **MIT (AASIST, AASIST-L, W2V2-AASIST, fairseq):** ship the copyright notice and license text with the model files: `apps/web/public/models/` for the light model and the release asset for the pro model.
- **Apache-2.0 (XLS-R base):** keep the license and any NOTICE with the pro model.
- **ODC-By (ASVspoof 2019 LA, ASVspoof 5):** attribute the datasets in `docs/model-card.md`.
- **Requirement 1.3:** each shipped Model_Manifest records `license.code`, `license.weights`, the training-data license, `verifiedOn: 2026-10-31` (or the date of a later re-check) and `source` with the pinned Hub revision above. The re-check happens at export (detection-model task 6.2).

Shortlist for evaluation: **AASIST-L** and **AASIST** (light), **W2V2-AASIST** (pro), and SSL-AASIST as an evaluation-only comparison. That leaves one accepted pro candidate, where Requirement 1.1 asks for at least two documented. The other five are documented but rejected or pending, so they count as documented, not shippable.
