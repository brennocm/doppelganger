/** Shared contracts: types generated from JSON Schema, plus validators for untrusted JSON. */
export const PACKAGE_NAME = "@doppelganger/contracts";

export type * from "./generated/index.ts";
export { parseIncidentSummary, SUMMARY_FIELDS, type SummaryResult } from "./incident-summary.ts";
export { MANIFEST_FIELDS, type ManifestResult, parseModelManifest } from "./manifest.ts";
export type {
  AudioChunkMessage,
  WorkerErrorCode,
  WorkerInbound,
  WorkerOutbound,
} from "./worker-messages.ts";
