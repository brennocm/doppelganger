# Design Document

## Overview

A small functional core. Each component is a pure function or a minimal object with explicit state, so it can be exhaustively property-tested. The `createDetector` pipeline wires them together and talks to an `InferenceBackend`.

## Architecture

```text
samples (Float32, 16 kHz) ─► Windower ─► VoiceActivity ─┬─ unvoiced ─► HauntingMachine.tick(silence)
                                                        └─ voiced ───► InferenceBackend.run
                                                                        ─► Scorer ─► Smoother ─► HauntingMachine.score
                                                                                                    ─► listeners (UI)
```

## Components and Interfaces

```ts
// windower.ts
export interface WindowerConfig { windowSamples: number; hopSamples: number }
export interface AudioWindow { index: number; startSample: number; samples: Float32Array }
export function createWindower(cfg: WindowerConfig): {
  push(chunk: Float32Array): AudioWindow[];
  reset(): void;
};

// voice-activity.ts
export interface VadConfig { minRms: number; maxZeroCrossingRate: number; minVoicedFraction: number }
export function isVoiced(window: Float32Array, cfg: VadConfig): boolean;

// scorer.ts
export type ScoreResult = { ok: true; score: number } | { ok: false; error: "invalid-output" };
export function score(output: Float32Array, manifest: ModelManifest): ScoreResult;

// smoother.ts
export function createSmoother(alpha: number): { next(score: number): number; reset(): void };

// haunting-machine.ts
export type HauntingState = "idle" | "listening" | "mask" | "unease" | "possession" | "exorcised";
export type HauntingEvent =
  | { type: "capture-started"; at: number }
  | { type: "capture-stopped"; at: number }
  | { type: "window-scored"; at: number; smoothed: number }
  | { type: "silence"; at: number }
  | { type: "protocol-completed"; at: number };
export interface HauntingConfig {
  unease: number; possession: number; release: number;
  confirmWindows: number; releaseWindows: number; silenceMs: number;
}
export interface MachineState {
  state: HauntingState; aboveCount: number; belowCount: number; lastVoicedAt: number | null;
}
export function transition(s: MachineState, e: HauntingEvent, cfg: HauntingConfig): MachineState;

// inference.ts
export interface InferenceBackend {
  load(manifest: ModelManifest): Promise<void>;
  run(window: Float32Array): Promise<Float32Array>;
  dispose(): Promise<void>;
}

// detector.ts
export function createDetector(opts: {
  manifest: ModelManifest; backend: InferenceBackend; config: DetectorConfig; clock: () => number;
}): {
  push(chunk: Float32Array): void;
  start(): void; stop(): void; completeProtocol(): void;
  subscribe(fn: (update: DetectorUpdate) => void): () => void;
  stats(): SessionStats;
};
```

### Default configuration

| Key | Default | Reason |
| --- | --- | --- |
| `alpha` | 0.4 | About 2 to 3 s of memory at a 1 s hop |
| `unease` | 0.40 | |
| `possession` | 0.70 | |
| `release` | 0.50 | Hysteresis gap of 0.20 |
| `confirmWindows` | 3 | About 3 s of sustained evidence |
| `releaseWindows` | 5 | Slower to calm down than to alarm |
| `silenceMs` | 2500 | |
| `maxPending` | 2 | Bounded latency on slow machines |

Thresholds can be overridden by the manifest (tuned per model on the dev split). `resolveConfig(manifest, overrides)` merges the defaults, then `manifest.thresholds`, then explicit overrides.

### Implementation details (P23)

- **Voice activity.** A window is split into 20 ms frames (320 samples at 16 kHz; a shorter last frame counts if it has at least 160 samples). A frame is voiced when its RMS is ≥ `minRms` and its zero-crossing rate (sign changes per sample pair) is ≤ `maxZeroCrossingRate`; a frame with a non-finite sample is unvoiced. The window is voiced when the voiced fraction of its frames is ≥ `minVoicedFraction`. Defaults: `minRms` 0.01 (−40 dBFS), `maxZeroCrossingRate` 0.35 (white noise is near 0.5), `minVoicedFraction` 0.3.
- **Neural voice activity (Requirement 2.3).** `createDetector` accepts an optional `voiceActivity: (window) => Promise<boolean>`. `neuralVoiceActivity(backend, threshold)` builds one from an already loaded `InferenceBackend` whose first output value is a speech probability. Without it, the energy check is used.
- **Scorer input.** `score` takes `ArrayLike<number>`, so a `Float32Array` from ONNX Runtime and the float64 golden logits use the same code. The output length must match `outputKind` (1 or 2), otherwise `invalid-output`.
- **Exorcised, as Requirement 5 is written.** In Exorcised, a scored window below `unease` moves to Mask and one in `[unease, possession)` to Unease (criteria 5.2 and 5.3 exempt only Possession). One at or above `possession` keeps Exorcised until `confirmWindows` consecutive ones re-enter Possession (criterion 5.7). `protocol-completed` resets both counters, so re-possession needs fresh evidence.
- **Counters.** `aboveCount` counts consecutive scored windows with `smoothed ≥ possession`, `belowCount` those with `smoothed < release`. Unvoiced windows (`silence` events) neither count nor reset them. A smoothed value at or above `possession` that is not yet confirmed shows Unease (outside Possession and Exorcised).
- **Queue.** Every window (voiced or not) enters one FIFO, so updates keep window order. When more than `maxPending` windows wait, the oldest waiting window is dropped and counted in `droppedWindows`; the window being processed is not counted as waiting. A rejected `run` and an `invalid-output` both count in `failedWindows`; three in a row emit an update with `error: "inference-failed"`. `stop()` clears the queue, and a result that arrives after `stop()` is ignored.
- **Statistics.** `voicedMs` adds one hop (`hopSamples / sampleRate`) per voiced window. `msInState` and transition times use the injected clock; `stats()` includes the time spent so far in the current state.
- **Haunting golden vectors.** `packages/contracts/fixtures/golden/haunting.json` holds event sequences with the expected smoothed values and states. The TS test renders the vectors and compares them with the file through Vitest's `toMatchFileSnapshot`; `vitest run -u` rewrites it. The file is excluded from Biome, so the test alone controls its format. The Python port in detection-model 3.2 asserts against the same file.

## Data Models

`DetectorUpdate`: `{ state, smoothed, raw, windowIndex, at }`. `SessionStats`: `{ startedAt, voicedMs, peak, msInState: Record<HauntingState, number>, transitions: {from, to, at}[], droppedWindows }`. Both have JSON Schemas in `packages/contracts`.

## Correctness Properties

### Property 1: Window count

*For any* sequence of chunks with total length N, the Windower emits exactly `max(0, floor((N − W) / H) + 1)` windows, where W is `windowSamples` and H is `hopSamples`.

**Validates: Requirements 1.1**

### Property 2: Chunking invariance

*For any* signal and any two ways of splitting it into chunks, the emitted windows are identical in count, order and contents, and each window equals the slice `[i·H, i·H + W)` of the concatenated signal.

**Validates: Requirements 1.1, 1.2**

### Property 3: Bounded memory

*For any* chunk sequence, the Windower never holds more than `W + maxChunk` samples.

**Validates: Requirements 1.3**

### Property 4: Score bounds and rejection

*For any* model output, `score` returns a value in [0, 1] when all values are finite, and `invalid-output` otherwise.

**Validates: Requirements 3.1, 3.2**

### Property 5: Smoother stays in range

*For any* non-empty score sequence, every smoothed value lies between the minimum and maximum of the scores seen so far.

**Validates: Requirements 4.1**

### Property 6: No possession without confirmation

*For any* event sequence, if the machine enters Possession at event k, then the `confirmWindows` most recent `window-scored` events up to and including k all have `smoothed ≥ possession`.

**Validates: Requirements 5.4, 5.7**

### Property 7: Possession is sticky

*For any* event sequence, once in Possession the machine leaves it only through `protocol-completed`, `capture-stopped`, or after `releaseWindows` consecutive `window-scored` events with `smoothed < release`.

**Validates: Requirements 5.5, 5.6, 5.8**

### Property 8: No flicker inside the hysteresis band

*For any* sequence of `window-scored` events whose smoothed values all lie in `[release, possession)`, starting from Possession, the machine never leaves Possession; starting outside Possession, it never enters it.

**Validates: Requirements 5.4, 5.5**

### Property 9: Exorcised requires Possession

*For any* event sequence, the machine enters Exorcised only from Possession, through `protocol-completed`.

**Validates: Requirements 5.6**

### Property 10: Stop resets

*For any* event sequence followed by `capture-stopped`, the state is Idle and all counters are zero.

**Validates: Requirements 5.9**

### Property 11: Invalid configurations rejected

*For any* configuration with `release ≥ possession` or `unease > possession`, creating the detector throws a configuration error.

**Validates: Requirements 5.10**

### Property 12: Statistics never contain audio

*For any* session, the serialized `SessionStats` contain only the fields of its schema, and its size is independent of the number of samples processed (bounded by the number of transitions).

**Validates: Requirements 6.2**

### Property 13: Bounded queue

*For any* arrival pattern of windows and backend latencies, the number of pending windows never exceeds `maxPending`, and processed windows are in increasing index order.

**Validates: Requirements 7.2**

## Error Handling

- Backend `run` rejects: the window is counted as failed, the machine is not updated, and after 3 consecutive failures the detector emits an `inference-failed` update that the UI shows as a recoverable error.
- Configuration errors throw at creation with the offending key.

## Testing Strategy

- fast-check property tests for Properties 1 to 13 (200 runs each), using a fake `InferenceBackend` with controllable latency and outputs and an injected clock.
- Golden vectors for windowing and calibration shared with Python.
- Example tests for each transition in Requirement 5.
