/** Shared contracts: types generated from JSON Schema, plus validators for untrusted JSON. */
export const PACKAGE_NAME = "@doppelganger/contracts";

export {
  AUTOPSY_FIELDS,
  type AutopsyResult,
  parseAutopsyReport,
  VERDICT_REASONS,
} from "./autopsy-report.ts";
export type * from "./generated/index.ts";
export {
  parseIncidentSummary,
  SUMMARY_FIELDS,
  SUMMARY_NOTE_TEXT,
  type SummaryResult,
} from "./incident-summary.ts";
export { MANIFEST_FIELDS, type ManifestResult, parseModelManifest } from "./manifest.ts";
export type {
  StreamError,
  StreamHello,
  StreamReady,
  StreamScore,
  StreamServerMessage,
} from "./stream-messages.ts";
export type {
  AudioChunkMessage,
  WorkerErrorCode,
  WorkerInbound,
  WorkerOutbound,
} from "./worker-messages.ts";
