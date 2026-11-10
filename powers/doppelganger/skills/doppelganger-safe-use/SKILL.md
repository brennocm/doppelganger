---
name: doppelganger-safe-use
description: Use when someone asks whether a recording or voice note might be a deepfake, a cloned voice or a synthetic voice. Explains how to run the Doppelgänger MCP tools on a WAV file and how to report the result honestly, as a probabilistic Dissonance_Score that is never proof.
---

# Checking suspicious audio with Doppelgänger

## When to use

Use this for a recording that someone suspects is synthetic, for example a voice note asking for an urgent payment. The tools estimate whether a voice is **synthetic**. They do not say **who** is speaking and cannot confirm an identity.

## How to use

1. Call `list_models` and name the model you use, with its ID and SHA-256. If the only model is `ci-synthetic-linear`, stop and say so. It is a synthetic test model and its scores mean nothing. Never pass it as `model_id` for a real recording. The `aasist-l` and `aasist` models have not been measured on call audio (`docs/model-card.md`); say so with the result.
2. Call `analyze_audio_file` with a path inside the allowed folders (`DOPPELGANGER_MCP_ROOTS`). Only WAV files of up to 20 MB and 5 minutes are read. Other formats have to be converted by the user first. Do not convert files yourself or write audio anywhere.
3. Call `explain_thresholds` if the user asks why the verdict came out as it did.

## How to report

- Give the verdict (`likely-human`, `inconclusive` or `likely-synthetic`), the peak and mean Dissonance_Score, and when the state reached Unease or Possession.
- Call it a *Dissonance_Score*, never "accuracy", "certainty" or "confidence".
- Say plainly that the score is probabilistic and is not proof. Codecs, noise, accents, short clips and voice generators the model has never seen all cause errors in both directions.
- Always add the next step. Do not approve anything because of this result alone. Ask the agreed code word, or hang up and call back on a known number.
- Never invent numbers. Report only what the tool returned.
- Point to the model card for what the model can and cannot do: https://github.com/brennocm/doppelganger/blob/main/docs/model-card.md
