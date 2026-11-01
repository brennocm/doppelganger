/** Scorer: raw model output to a calibrated Dissonance_Score (Requirement 3). */
import type { ModelManifest } from "@doppelganger/contracts";

export type ScoreResult = { ok: true; score: number } | { ok: false; error: "invalid-output" };

type Calibration = Pick<ModelManifest, "outputKind" | "spoofIndex" | "calibration">;

const INVALID: ScoreResult = { ok: false, error: "invalid-output" };

/** Numerically stable logistic function; same branches as model_lab.calibration.sigmoid. */
export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/**
 * `sigmoid(z / T)`, where z is the single logit or the spoof logit minus the other one
 * (equal to `softmax(z / T)[spoofIndex]`). Rejects NaN, infinities and wrong lengths.
 */
export function score(output: ArrayLike<number>, manifest: Calibration): ScoreResult {
  const values = Array.from(output);
  if (!values.every(Number.isFinite)) return INVALID;
  const temperature = manifest.calibration.temperature;
  if (!(Number.isFinite(temperature) && temperature > 0)) return INVALID;
  let margin: number;
  if (manifest.outputKind === "single-logit") {
    if (values.length !== 1) return INVALID;
    margin = values[0] ?? Number.NaN;
  } else {
    const spoof = manifest.spoofIndex;
    if (values.length !== 2 || (spoof !== 0 && spoof !== 1)) return INVALID;
    margin = (values[spoof] ?? Number.NaN) - (values[1 - spoof] ?? Number.NaN);
  }
  if (!Number.isFinite(margin)) return INVALID;
  return { ok: true, score: sigmoid(margin / temperature) };
}
