# Requirements Document

## Introduction

This is the project's centerpiece: the detector UI that looks like a harmless call widget while the voice sounds human and visibly rots as dissonance rises. It includes the main view, the waveform "spectre" visualizer, the Twin mascot, the floating Picture-in-Picture widget, and the accessibility and motion-safety rules that make the effects safe.

## Glossary

- **Main_View**: the full app page at `/app/`.
- **Spectre**: the canvas waveform visualizer whose shape and color follow the haunting state.
- **Twin**: the original ghost mascot whose expression follows the haunting state.
- **Widget**: the compact view shown in a Document Picture-in-Picture window, or as a compact in-page mode when that API is unavailable.
- **Test_State_Mode**: a URL parameter (`?test-state=<state>`) available only in development and E2E builds that forces a haunting state.

## Requirements

### Requirement 1: State presentation

**User Story:** As a user on a call, I want to understand the state at a glance, so that I don't have to read numbers mid-conversation.

#### Acceptance Criteria

1. THE Main_View SHALL present each haunting state with its headline and supporting line from the design-system steering, its icon, its Spectre shape and its colors.
2. THE Main_View SHALL show the smoothed dissonance score as an integer from 0 to 100 with tabular numerals, labelled "Dissonance".
3. WHEN the state changes, THE Main_View SHALL transition between state presentations within 200 ms, except the Possession entrance, which uses the orchestrated sequence in Requirement 3.
4. THE state SHALL never be conveyed by color alone.

### Requirement 2: The Spectre

**User Story:** As a viewer, I want the voice itself to look haunted when it's fake.

#### Acceptance Criteria

1. THE Spectre SHALL render from a 64-band level summary posted by the worker at no more than 30 updates per second, never from raw audio on the main thread.
2. WHILE in Mask, THE Spectre SHALL draw a smooth, symmetric wave in `purple`.
3. WHILE in Unease, THE Spectre SHALL add jitter proportional to how far the score is above `unease`, in `ember`.
4. WHILE in Possession, THE Spectre SHALL draw a torn, displaced wave in `ecto` over a `blood-deep` tint.
5. WHEN the page is hidden, THE Spectre SHALL stop rendering.

### Requirement 3: Possession entrance

**User Story:** As a viewer, I want the moment of detection to be unforgettable but safe.

#### Acceptance Criteria

1. WHEN Possession is entered, THE Main_View SHALL play a single orchestrated sequence of at most 1.5 s: the surface tints to `blood-deep`, the Spectre tears, the Twin turns, and the alert headline appears.
2. THE sequence SHALL flash no more than 3 times per second and SHALL never flash more than 25% of the viewport at once.
3. WHERE the user prefers reduced motion, THE Main_View SHALL replace the sequence with a single cross-fade to the Possession presentation.
4. WHEN Possession is entered, THE app SHALL announce the alert through an assertive live region; other state changes SHALL use a polite live region.
5. WHERE the user enabled sound cues, THE app SHALL play one short, low tone on Possession entry; sound cues SHALL be off by default.

### Requirement 4: The Twin

**User Story:** As a viewer, I want a character that makes the state memorable.

#### Acceptance Criteria

1. THE Twin SHALL be an original inline SVG with one expression per haunting state.
2. THE Twin SHALL be decorative (`aria-hidden="true"`); the state text carries the meaning.
3. THE Twin SHALL NOT reproduce or modify the Kiro logo.

### Requirement 5: Floating widget

**User Story:** As a user on a call, I want a small always-on-top view, so that I can keep the call in front of me.

#### Acceptance Criteria

1. WHERE Document Picture-in-Picture is supported, WHEN the user chooses "Float over the call", THE app SHALL open a 320 × 180 window containing the state headline, the score, a compact Spectre and a "Stop" control.
2. WHERE it is not supported, THE app SHALL offer a compact in-page layout instead and explain why.
3. WHEN Possession is entered while the Widget is open, THE Widget SHALL show the alert and a control that brings the protocol into view in the Main_View.
4. WHEN the Widget window is closed, THE Main_View SHALL continue the session without interruption.

### Requirement 6: Layout and responsiveness

**User Story:** As any user, I want the UI usable on a laptop and a phone.

#### Acceptance Criteria

1. THE Main_View SHALL be usable at widths from 375 px to 1440 px and at 200% zoom without horizontal scrolling.
2. THE Main_View SHALL keep one primary action per state (Idle: "Listen to a call tab"; active states: "Stop listening"; Possession: "Start the protocol").
3. THE Main_View SHALL be fully operable by keyboard with a visible `purple` focus ring.

### Requirement 7: Tokens and contrast

**User Story:** As the maintainer, I want the look defined by tokens, so that it stays consistent and accessible.

#### Acceptance Criteria

1. THE UI SHALL take every color, spacing, radius, type role, duration and easing from `packages/tokens`.
2. THE token build SHALL fail if any pair in `contrast-pairs.json` falls below its target (4.5:1 for text, 3:1 for large text, icons and controls).
3. THE UI SHALL theme `::selection`, `caret-color`, `accent-color`, the focus ring, scrollbars and `theme-color`.

### Requirement 8: Test state mode

**User Story:** As a developer and as the snapshot hook, I want to force any state.

#### Acceptance Criteria

1. WHERE the build is a development or E2E build, THE app SHALL accept `?test-state=<state>&score=<0-100>` and render that state without capture.
2. THE production build SHALL ignore the parameter.
