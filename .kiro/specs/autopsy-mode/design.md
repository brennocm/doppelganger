# Design Document

## Overview

Autopsy reuses everything: the detector pipeline (fed faster than real time), the worker, the state machine (replayed to derive the verdict) and the tokens. The only new pieces are file intake, a timeline view and the report schema. Halloween flavor: the view is titled "Autopsy", segments in Possession are marked on the timeline in `blood`, and the Twin appears dissected into the analyzed segments.

## Architecture

```text
File ─► size check ─► arrayBuffer() ─► OfflineAudioContext.decodeAudioData ─► duration check
     ─► downmix + resample (same primitives as audio-capture)
     ─► Inference worker: detector in "batch" mode (no real-time pacing, cancellable)
     ─► AutopsyReport ─► TimelineView (canvas) + Verdict + Download JSON
```

Batch mode feeds windows as fast as the backend allows, posting progress every 10 windows. Cancellation sets a flag checked between windows.

## Components and Interfaces

```ts
// packages/detector/src/autopsy.ts
export interface AutopsyWindow { index: number; startS: number; endS: number; voiced: boolean; score: number | null; smoothed: number | null }
export interface AutopsyReport {
  modelId: string; modelVersion: string; durationS: number;
  windows: AutopsyWindow[];
  states: { from: number; to: number; state: HauntingState }[];
  verdict: "likely-human" | "inconclusive" | "likely-synthetic";
  verdictReason: string;
}
export function deriveVerdict(windows: AutopsyWindow[], cfg: HauntingConfig): Pick<AutopsyReport, "states" | "verdict" | "verdictReason">;
```

`deriveVerdict` replays `transition` from `haunting-machine.ts` over the windows; it never duplicates the state machine logic.

### Timeline view

A canvas at full width, 160 px high: the smoothed score as a line, dashed lines for `unease` and `possession`, segment backgrounds per state using the state tokens, a playhead synced to an `<audio>` element whose `src` is a Blob URL of the file (revoked when the view closes). Keyboard: left and right arrows move the playhead by one window; Enter plays.

## Data Models

`AutopsyReport` JSON Schema in `packages/contracts/schemas/autopsy-report.json`, shared with the engine and the MCP server.

## Correctness Properties

### Property 1: Verdict consistency with the state machine

*For any* sequence of windows, the verdict is "likely-synthetic" if and only if replaying the state machine reaches Possession; "inconclusive" if it reaches Unease but not Possession, or there are fewer than 3 voiced windows; "likely-human" otherwise.

**Validates: Requirements 2.4, 3.3**

### Property 2: Batch equals streaming

*For any* signal, the per-window scores from batch mode equal those from streaming the same signal in real-time chunks.

**Validates: Requirements 2.1**

### Property 3: Report has no audio

*For any* report, the serialized JSON validates against the schema (`additionalProperties: false`, no sample arrays) and its size grows only with the number of windows.

**Validates: Requirements 3.5**

### Property 4: Limits enforced before decoding

*For any* file size above 20 MB, the intake rejects it without calling `decodeAudioData`.

**Validates: Requirements 1.3**

## Error Handling

| Condition | Message |
| --- | --- |
| Too large | "This file is over 20 MB. Trim it to under 5 minutes and try again." |
| Too long | "This recording is longer than 5 minutes. Trim it and try again." |
| Decode failure | "This browser can't read this file. Convert it to WAV and drop it again." |
| Cancelled | "Analysis cancelled. Nothing was kept." |

## Testing Strategy

- fast-check tests for Properties 1 to 4 (fake backend, synthetic signals).
- Playwright: drop the replay fixtures and assert the verdict, timeline and download.
