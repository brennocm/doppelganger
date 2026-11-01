# Design Document

## Overview

A small feature module, `apps/web/src/features/protocol/`, with a pure summary builder in `packages/detector` (so it is property-testable and shared with the engine). The panel appears below the Spectre in Possession and remains in a collapsed form in Exorcised.

## Architecture

```text
DetectorUpdate (state = possession) ─► ProtocolPanel (steps, done flags)
                                         │ all done
                                         ▼
                                   detector.completeProtocol() ─► state = exorcised
SessionStats + protocol flags + meta ─► buildIncidentSummary() ─► { text, json }
                                                                    ├─ Copy (Clipboard API)
                                                                    └─ Download (Blob URL, revoked after click)
```

## Components and Interfaces

```ts
// packages/detector/src/incident-summary.ts
export interface SummaryInput {
  stats: SessionStats;
  source: "tab" | "mic" | "replay";
  replayLabel?: "genuine" | "synthetic";
  model: { id: string; version: string };
  appVersion: string;
  stepsDone: ReadonlyArray<1 | 2 | 3 | 4>;
  endedAt: number;
  timeZoneOffsetMinutes: number;
}
export function buildIncidentSummary(input: SummaryInput): { text: string; json: IncidentSummary };
```

Plain-text example (illustrative values):

```text
Doppelgänger incident summary
Started: 2026-11-20T14:03:12-03:00   Ended: 2026-11-20T14:09:40-03:00
Source: call tab   Voiced speech: 4 min 51 s
Dissonance: peak 91, mean 63
Time in states: mask 1 min 10 s, unease 52 s, possession 3 min 2 s
Possession entered at 14:05:31
Protocol steps done: 1, 2, 3
Model: aasist-l-codec-v1 1.0.0   App: 0.4.0
The dissonance score is a probabilistic estimate that the voice was synthetic. It is not proof.
```

### Panel

A `<section aria-labelledby>` with an `<ol>`; each step is a `<li>` with a native checkbox labelled by the step title. In Exorcised, the panel collapses to a single line, "Protocol completed at 14:07", with a toggle to expand.

## Data Models

`IncidentSummary` JSON Schema in `packages/contracts/schemas/incident-summary.json`, with `additionalProperties: false`.

## Implementation details (P27)

- **Fields.** `IncidentSummary` (schema file `incident-summary.schema.json`):
  - `schemaVersion: 1`
  - `replay: { label } | null`
  - `startedAt` and `endedAt`: ISO 8601 with offset; `startedAt` is null if capture never started
  - `source`
  - `voicedSeconds`
  - `dissonance: { peak, mean }`: integers 0–100, or null
  - `secondsInState`: one entry per state
  - `transitions: [{ from, to, at }]`, with `at` in ISO 8601
  - `model: { id, version }`, `appVersion`, `stepsDone`
  - `note`: the probabilistic-estimate sentence

  TS validates untrusted JSON with `parseIncidentSummary`, which a test keeps equal to the schema (as for the manifest). The mean comes from `SessionStats.meanSmoothed`, the mean smoothed score over scored windows (added to the detection-core schema).
- **Free text.** The only strings taken from the input are the model ID (manifest ID pattern) and the model and app versions (`x.y.z`). `buildIncidentSummary` throws on anything else, so nothing user-supplied can reach the summary. `appVersion` is `apps/web/package.json`'s version, injected at build time.
- **Times.** Text times use the input's `timeZoneOffsetMinutes`, so the output does not depend on the machine's time zone (Property 2). Durations are shown as "X min Y s".
- **Panel lifetime.** The panel is shown in Possession, collapsed in Exorcised, and reset and hidden when the session ends (Idle). The Widget's "Show the protocol" button is visible in Possession and Exorcised.
- **Test_State_Mode.** With `?test-state=possession`, completing all steps moves the forced state to Exorcised in the page, because no detector session runs. Playwright uses this for the journey.
- **Reminder storage.** The key is `doppelganger.codeWordReminder` in `localStorage`. It holds only the hint, never audio or scores.

## Correctness Properties

### Property 1: Summary excludes forbidden data

*For any* `SummaryInput`, the JSON summary validates against the schema (which has no audio, levels, URL, title or file-name fields), and the text output contains none of the input's free-text fields other than the model ID and version.

**Validates: Requirements 3.2**

### Property 2: Summary is deterministic

*For any* `SummaryInput`, calling `buildIncidentSummary` twice yields identical output.

**Validates: Requirements 3.1**

### Property 3: Replay is always disclosed

*For any* `SummaryInput` with `source = "replay"`, the first line of the text summary states that it was a replay and names the clip label.

**Validates: Requirements 3.5**

### Property 4: Completion requires all steps

*For any* subset of steps marked done, `protocol-completed` is sent if and only if the subset is {1, 2, 3, 4}.

**Validates: Requirements 1.2, 1.3**

### Property 5: Reminder length bound

*For any* string, saving a Code_Word_Reminder succeeds only if its length is between 1 and 80 characters after trimming.

**Validates: Requirements 2.1**

## Error Handling

- Clipboard API unavailable or denied: show the text in a read-only textarea, selected, with "Press Ctrl+C to copy".

## Testing Strategy

- fast-check tests for Properties 1 to 5.
- Playwright: force Possession, complete all steps, assert Exorcised; copy and download the summary and validate the JSON against the schema.
