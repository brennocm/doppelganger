# 0005 — Codec-augmented fine-tuning of the light model

- Status: proposed (draft, prepared before the go/no-go gate)
- Date: 2026-10-31
- Related: `detection-model` Requirements 3.2, 1.2, 5.x; `packages/model-lab/CANDIDATES.md`; ml-honesty steering

## Context

The accepted light candidates, AASIST-L and AASIST, were trained only on ASVspoof 2019 LA. Their uploaders report In-the-Wild EERs of 33–44 %. These numbers have not been reproduced by this project; see `CANDIDATES.md`. Call audio adds codec compression (Opus at 16–32 kbps), a narrower band and noise. So the go/no-go gate (Requirement 3.1: ROC AUC ≥ 0.85 and false alarms ≤ 5 % on the Haunt_Set at Opus 16 kbps) may fail with off-the-shelf weights. Requirement 3.2 makes codec-augmented fine-tuning the first fallback. This ADR prepares it now, so a failed gate on 9 November costs days, not weeks.

## Decision (proposed)

Fine-tune the best light candidate (AASIST-L first, AASIST second) on public, license-checked spoofing data augmented with the same Codec_Conditions the evaluation uses. Train in a free cloud GPU notebook kept **outside** the repository, and bring back only the resulting checkpoint for export.

### Data

| Use | Dataset | License (checked 2026-10-31) |
| --- | --- | --- |
| Training | ASVspoof 2019 LA train and dev partitions | ODC-By (dataset packaging and asvspoof.org) |
| Training | ASVspoof 5 train partition | ODC-By (Zenodo record 14498691) |
| Noise for augmentation | MUSAN (OpenSLR 17), or equivalent | **To verify before use** |
| Never for training | The Haunt_Set | Private evaluation set; training on it would make the gate meaningless |

- Every additional dataset passes the same check as `CANDIDATES.md` (Requirement 1.2) before use.
- Gated or undisclosed sets, such as MLAAD without a readable license, are excluded.
- Raw data stays outside the repository (`$FINETUNE_DATA_DIR`), per the ml-honesty steering.

### Augmentation

Each training example goes through one condition drawn at random:

- clean;
- Opus at 16 or 32 kbps;
- 8 kHz telephone band;
- added noise at 5–20 dB SNR;
- random gain;
- RawBoost, as used for W2V2-AASIST.

The codec code is `model_lab.codecs`, the same module the evaluation uses, so the training conditions cannot drift from the evaluated ones.

### Training

- **Where:** a free cloud GPU notebook (for example Colab or Kaggle). The notebook lives in the developer's own storage, not in this repository.
- **Inputs:** the pinned candidate checkpoint (Hub revision from `CANDIDATES.md`) and the datasets above.
- **Outputs:** a PyTorch `state_dict`, the training configuration, the seed, and the dataset list with licenses.
- **What comes back:** only the checkpoint and a small `finetune.json` with those details. No raw data and no notebook.

### Export path back into the model lab

1. Put the checkpoint in `$FINETUNED_DIR`, outside the repository.
2. `mise run model:eval` evaluates it as one more candidate, side by side with the off-the-shelf weights, on the same Haunt_Set split and conditions.
3. If it passes the gate, `mise run model:export` exports it like any other model: ONNX export, the parity check, int8 kept only if the AUC drop is ≤ 0.01, and a manifest whose `source` names the base checkpoint and revision, the fine-tuning datasets and `finetune.json`.
4. The gate ADR records both results, before and after fine-tuning, with dates.

## Alternatives considered

- **Wait for the gate result first.** Rejected: if the gate fails, preparing data and a notebook would then sit on the critical path.
- **Train on the Haunt_Set.** Rejected: it would measure memorization of one voice, not detection.
- **Use the Pro_Model in the browser at a reduced rate.** Kept as the second fallback (Requirement 3.2). W2V2-AASIST is 1.3 GB in fp32, far above the 10 MB light-model limit, so it is unlikely to fit.
- **Train inside this repository or in CI.** Rejected: there is no GPU, and training code plus data handling would grow the repository and its dependency surface for a one-off job.

## Consequences

- The notebook is not reproducible from the repository alone. `finetune.json` (base revision, data, seed, augmentation settings) is the record. A later ADR can move training into the repository if it becomes routine.
- License obligations of the training data (ODC-By attribution) carry into the model card.
- No accuracy claim is made for the fine-tuned model until `mise run model:eval` produces one.
