/**
 * The model the app loads. Until detection-model 6.4 ships the Light_Model, this is the
 * synthetic CI model (role "test"); swapping in the real one changes only this line and
 * the two files in public/models/.
 */
// PENDING-GATE: point this at the Light_Model manifest from detection-model 6.4.
export const LIGHT_MODEL_MANIFEST = "models/ci-synthetic-linear.json";
