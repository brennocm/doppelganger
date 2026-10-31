# Requirements Document

## Introduction

Autopsy mode analyzes a recorded file instead of a live call, for example a WhatsApp voice note asking for money. The user drops a file, the app decodes it in memory, scores every window and shows a dissonance timeline with a verdict. It runs in the browser with the Light_Model; when the local Pro engine is available, the user can choose its heavier model instead.

## Glossary

- **Autopsy**: the file analysis feature.
- **Autopsy_Report**: per-window scores, the smoothed timeline, the state timeline and the verdict.
- **Verdict**: one of "Likely human", "Inconclusive" or "Likely synthetic", derived from the smoothed timeline.

## Requirements

### Requirement 1: File input

**User Story:** As a user who received a suspicious voice message, I want to drop the file and get an answer.

#### Acceptance Criteria

1. THE Autopsy SHALL accept files by drag and drop and by a file picker.
2. THE Autopsy SHALL accept the formats the browser can decode with `decodeAudioData`, including WAV, MP3, and Ogg Opus where supported, and SHALL list the supported formats for the current browser.
3. WHEN a file is larger than 20 MB or longer than 5 minutes, THE Autopsy SHALL reject it before analysis with a message naming the limit.
4. WHEN a file cannot be decoded, THE Autopsy SHALL say so and suggest converting it to WAV.
5. THE Autopsy SHALL read the file into memory only and SHALL release it after the report is built.

### Requirement 2: Analysis

**User Story:** As a user, I want the same detector used for calls applied to my file, so that results are consistent.

#### Acceptance Criteria

1. THE Autopsy SHALL resample the decoded audio to 16 kHz mono and analyze it with the same windowing, voice activity check, scoring and smoothing as live detection.
2. THE Autopsy SHALL run analysis in the Inference_Worker and SHALL show progress as a percentage of windows processed.
3. THE user SHALL be able to cancel an analysis in progress.
4. WHEN fewer than 3 voiced windows exist, THE Verdict SHALL be "Inconclusive" with the reason "Not enough speech".

### Requirement 3: Report

**User Story:** As a user, I want to see where in the file the voice sounds synthetic.

#### Acceptance Criteria

1. THE Autopsy_Report view SHALL show a timeline of the smoothed score with the unease and possession thresholds marked, and the haunting state per segment.
2. THE Autopsy_Report view SHALL let the user play the file from any point on the timeline.
3. THE Verdict SHALL be "Likely synthetic" when the replayed state machine reaches Possession, "Inconclusive" when it reaches Unease but not Possession, and "Likely human" otherwise.
4. THE Autopsy_Report view SHALL show the Verdict with the probabilistic-estimate note and the model ID.
5. THE user SHALL be able to download the Autopsy_Report as JSON without audio.

### Requirement 4: Pro engine option

**User Story:** As a SecOps user running the local engine, I want the heavier model for files.

#### Acceptance Criteria

1. WHERE the app is served by the local Pro engine, THE Autopsy SHALL offer a choice between "This browser (light model)" and "Local engine (pro model)".
2. WHEN the engine is chosen, THE app SHALL send the file to the engine's same-origin Autopsy endpoint with the session token.
3. THE engine response SHALL follow the same Autopsy_Report schema.
