# Requirements Document

## Introduction

`packages/detector` is the pure TypeScript core of Doppelgänger: it turns a stream of 16 kHz samples into windows, turns model outputs into calibrated dissonance scores, smooths them, and drives the haunting state machine with hysteresis so alerts are rare and trustworthy. It has no DOM, Web Audio or ONNX Runtime dependency; inference is reached through an interface.

## Glossary

- **Detector**: the `@doppelganger/detector` package.
- **Windower**: the component that slices a sample stream into overlapping windows.
- **Scorer**: the component that converts raw model output into a Dissonance_Score using the model manifest.
- **Smoother**: the exponential moving average over Dissonance_Scores.
- **Haunting_Machine**: the state machine with states Idle, Listening, Mask, Unease, Possession and Exorcised.
- **Voiced_Window**: a window that the voice activity check marks as containing speech.
- **Inference_Backend**: the interface that runs a model on one window.

## Requirements

### Requirement 1: Windowing

**User Story:** As the app, I want a continuous stream cut into model-sized windows, so that every second of speech is scored.

#### Acceptance Criteria

1. WHEN samples are pushed, THE Windower SHALL emit a window of `windowSamples` samples every `hopSamples` samples once at least `windowSamples` samples have been received.
2. THE Windower SHALL produce identical windows regardless of how the input stream is split into chunks.
3. THE Windower SHALL keep at most `windowSamples + maxChunk` samples in memory.
4. WHEN reset, THE Windower SHALL discard all buffered samples.

### Requirement 2: Voice activity

**User Story:** As a user, I want silence ignored, so that pauses never trigger alerts.

#### Acceptance Criteria

1. THE Detector SHALL classify each window as voiced or unvoiced with an energy-and-zero-crossing check whose thresholds come from configuration.
2. WHEN a window is unvoiced, THE Detector SHALL skip inference for it.
3. WHERE a neural voice activity model is configured, THE Detector SHALL use it through the Inference_Backend interface instead of the energy check.

### Requirement 3: Scoring

**User Story:** As the app, I want raw model outputs turned into comparable probabilities.

#### Acceptance Criteria

1. THE Scorer SHALL apply the calibration in the model manifest and return a Dissonance_Score in [0, 1].
2. WHEN the model output contains NaN or an infinite value, THE Scorer SHALL reject the window with an `invalid-output` error and SHALL NOT update the Smoother.
3. THE Scorer SHALL produce the same values as the golden calibration vectors shared with the Python model lab.

### Requirement 4: Smoothing

**User Story:** As a user, I want a steady score, so that one odd second doesn't scare me.

#### Acceptance Criteria

1. THE Smoother SHALL compute an exponential moving average with a configurable `alpha` in (0, 1].
2. THE Smoother SHALL only consume scores from Voiced_Windows.
3. WHEN reset, THE Smoother SHALL forget all history.

### Requirement 5: Haunting state machine

**User Story:** As a user, I want the alert to appear only on sustained evidence and to stay until the evidence clears, so that I can trust it.

#### Acceptance Criteria

1. WHEN capture starts, THE Haunting_Machine SHALL move from Idle to Listening.
2. WHEN a Voiced_Window is scored and the smoothed score is below the `unease` threshold, THE Haunting_Machine SHALL be in Mask, unless it is in Possession or Exorcised.
3. WHEN the smoothed score is at or above `unease` and below `possession`, THE Haunting_Machine SHALL be in Unease, unless it is in Possession or Exorcised.
4. WHEN the smoothed score has been at or above `possession` for `confirmWindows` consecutive Voiced_Windows, THE Haunting_Machine SHALL enter Possession.
5. WHILE in Possession, THE Haunting_Machine SHALL stay in Possession until the smoothed score has been below `release` for `releaseWindows` consecutive Voiced_Windows.
6. WHEN the user completes the exorcism protocol while in Possession, THE Haunting_Machine SHALL enter Exorcised.
7. WHILE in Exorcised, THE Haunting_Machine SHALL re-enter Possession only under the same confirmation rule as criterion 4.
8. WHEN no Voiced_Window arrives for `silenceMs`, THE Haunting_Machine SHALL show Listening, except that Possession and Exorcised SHALL persist through silence.
9. WHEN capture stops, THE Haunting_Machine SHALL move to Idle and reset the Smoother and counters.
10. THE thresholds SHALL satisfy `release < possession` and `unease ≤ possession`; THE Detector SHALL reject other configurations at creation.

### Requirement 6: Session statistics

**User Story:** As a user, I want a summary of the call for the incident report, without any audio.

#### Acceptance Criteria

1. THE Detector SHALL track per session: start time, voiced duration, peak smoothed score, time spent in each state, and the timestamps of every transition.
2. THE session statistics SHALL contain no audio samples or model inputs.

### Requirement 7: Inference abstraction

**User Story:** As a developer, I want inference behind one interface, so that the browser worker, the local engine and test fakes are interchangeable.

#### Acceptance Criteria

1. THE Detector SHALL define an `InferenceBackend` interface with `load(manifest)`, `run(window)` and `dispose()`.
2. THE Detector SHALL process windows in order and SHALL drop the oldest pending window when more than `maxPending` windows are queued, counting each drop in the session statistics.
