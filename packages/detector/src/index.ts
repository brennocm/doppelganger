/** Pure detection logic. No DOM, no Web Audio, no onnxruntime. */
export const PACKAGE_NAME = "@doppelganger/detector";

export {
  type AudioWindow,
  ConfigError,
  createWindower,
  type Windower,
  type WindowerConfig,
} from "./windower.ts";
