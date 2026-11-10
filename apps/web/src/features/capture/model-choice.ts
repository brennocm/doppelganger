/**
 * The model the app loads: AASIST-L, the Light_Model (detection-model 6.4, P49). The
 * end-to-end build (`vite build --mode e2e`) keeps the synthetic CI model (role "test"),
 * whose scores are deterministic and say nothing about a voice.
 */
export const LIGHT_MODEL_MANIFEST =
  import.meta.env.MODE === "e2e" ? "models/ci-synthetic-linear.json" : "models/aasist-l.json";
