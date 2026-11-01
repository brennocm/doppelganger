/** Smoother: exponential moving average over Dissonance_Scores (Requirement 4). */
import { ConfigError } from "./windower.ts";

export interface Smoother {
  /** Feed one voiced window's score; returns the smoothed value. */
  next(score: number): number;
  /** Forget all history. */
  reset(): void;
}

/** The first score is returned as is; after that `alpha * score + (1 - alpha) * previous`. */
export function createSmoother(alpha: number): Smoother {
  if (!(Number.isFinite(alpha) && alpha > 0 && alpha <= 1)) {
    throw new ConfigError("alpha", "must be in (0, 1]");
  }
  let previous: number | null = null;
  return {
    next(value) {
      if (!Number.isFinite(value)) throw new RangeError("score must be finite");
      const smoothed = previous === null ? value : alpha * value + (1 - alpha) * previous;
      previous = smoothed;
      return smoothed;
    },
    reset() {
      previous = null;
    },
  };
}
