# Design Document

## Overview

**Mode:** Operate. The user is mid-call, so the job is one glance, one action. **Signature:** the Spectre tearing apart when the voice turns out to be a double. Everything else stays quiet: Kiro surfaces, system type, generous dark space.

## Brief

- **Who and what task:** someone on a web call who needs to know, without reading, whether the voice is human, and what to do if it isn't.
- **Real content:** a state headline, one supporting line, a 0–100 score, a waveform, at most one action.
- **Most important element:** the state headline plus the Spectre. The score is secondary.
- **Subject's world:** séance instruments, oscilloscopes, the "uncanny double" from folklore, and the Kiro product chrome as the "mask".
- **Scene:** a laptop beside a video call, often in a dim room, so a dark theme.

## First viewport (desktop)

```text
┌──────────────────────────────────────────────────────────────────┐
│  [Twin]  Doppelgänger                     Source: Meet tab  ● Stop │
│                                                                  │
│      Sounds human                                                │
│      Dissonance is low.                                          │
│                                                                  │
│  ~~~~~~~~~~~~~~~~~~~~~~~~ Spectre (canvas) ~~~~~~~~~~~~~~~~~~~~~~ │
│                                                                  │
│  Dissonance  12                    Float over the call           │
│                                                                  │
│  Model aasist-l-codec-v1 · runs on this device · nothing recorded│
└──────────────────────────────────────────────────────────────────┘
```

The footer facts use a definition list in the real markup (no middle-dot string); the sketch only shows content. In Possession, the protocol panel (exorcism-protocol spec) slides in below the Spectre and the primary action becomes "Start the protocol".

## Architecture

```text
apps/web/src/
 ├── app.ts                    # bootstraps capture, worker, views
 ├── features/haunting/
 │    ├── haunting-view.ts     # state → DOM (headline, line, score, icon)
 │    ├── spectre.ts           # canvas renderer
 │    ├── twin.ts              # SVG expressions
 │    ├── possession-sequence.ts
 │    └── live-regions.ts
 ├── features/widget/
 │    ├── pip-widget.ts        # Document Picture-in-Picture
 │    └── compact-mode.ts
 └── styles/
      ├── tokens.css           # generated from packages/tokens
      ├── base.css
      └── states.css           # [data-state="…"] rules
```

The root element carries `data-state` and `data-motion` (`full` | `reduced`). All state styling is CSS keyed on these attributes; TypeScript only sets attributes and draws the canvas.

## Components and Interfaces

### Spectre

```ts
export interface SpectreFrame { bands: Float32Array /* 64, 0..1 */; state: HauntingState; intensity: number /* 0..1 */ }
export function createSpectre(canvas: HTMLCanvasElement, motion: "full" | "reduced"): {
  draw(frame: SpectreFrame): void; pause(): void; resume(): void; dispose(): void;
};
```

- Mask: Catmull-Rom curve through mirrored band levels, a 2px `purple` stroke.
- Unease: the same curve plus per-point jitter `j = intensity × 6px`, re-seeded at 8 Hz (not per frame) to avoid shimmering, `ember` stroke.
- Possession: the curve is cut into 6 to 10 horizontal slices, each displaced by up to 24px and redrawn at ≤ 3 Hz; `ecto` stroke. Under reduced motion: static torn shape, no displacement updates.
- Device-pixel-ratio aware; capped at 30 fps.

### Possession sequence (1.5 s, one time per entry)

| t | Change |
| --- | --- |
| 0 ms | Surface tint transitions to `blood-deep` (400 ms ease-out) |
| 150 ms | Spectre switches to torn mode (first displacement) |
| 400 ms | The Twin turns its head (SVG transform, 300 ms) |
| 700 ms | Headline "Doppelgänger detected" replaces the previous one; assertive announcement |
| 1000 ms | Protocol panel enters (200 ms) |

At most 2 luminance changes in the sequence, all within the Spectre's area (well under 25% of the viewport).

### Widget

`documentPictureInPicture.requestWindow({ width: 320, height: 180 })`; copies `tokens.css` and `states.css` into the PiP document; renders a compact view that subscribes to the same update stream. Closing it fires `pagehide`, and the view unsubscribes.

### Tokens

`packages/tokens/tokens.json` (source of truth) → build script → `tokens.css` (custom properties) + `tokens.ts` (typed names) + contrast report. `contrast-pairs.json` lists foreground/background pairs with their targets; the script computes WCAG 2.x contrast and exits non-zero on failure.

## Data Models

`SpectreFrame` levels come from the worker as a 64-element `Float32Array` of band energies. These are derived features, not audio, and are allowed on the main thread by the audio-capture spec. The worker message schema in `packages/contracts` is updated to include `{ type: "levels", bands }`.

## Implementation details (P26)

- **Levels message.** `bands` travels as a plain `number[]`, not a `Float32Array`, so audio-capture Property 5 (no typed arrays reach the main thread) still holds. The Spectre converts it to the `Float32Array` of `SpectreFrame`. The worker computes it once per 100 ms chunk (10 per second): a 512-point FFT with a Hann window over the chunk's last 512 samples, 64 log-spaced bands from 80 Hz to 8 kHz, then dB mapped from [−80, −10] to [0, 1].
- **Tokens location.** The token build writes `packages/tokens/generated/tokens.css` and `generated/tokens.ts`; both are committed, and a test fails when they are stale, as with the contracts. The app imports `@doppelganger/tokens/tokens.css`, so `apps/web/src/styles/` holds only `base.css` and `states.css`. The build script lives in `packages/tokens/build/` and runs on Node's type stripping; `src/` keeps no runtime dependencies.
- **Test_State_Mode.** It is enabled when `import.meta.env.MODE !== "production"`. Playwright builds with `vite build --mode e2e`; the Pages build uses the default production mode, where the branch is removed at build time. In this mode the Spectre draws one deterministic frame and no animation, and Possession shows its final presentation, so screenshots are stable.
- **Screenshots.** Playwright's `toHaveScreenshot` baselines for the 6 states × 375/1440 px × full/reduced motion are committed under `apps/web/e2e/`. Accessibility is checked with `@axe-core/playwright` (MPL-2.0, development only, unmodified).
- **Twin.** One inline SVG in `index.html`. Each expression is a group shown by CSS keyed on `data-state`, so no inline styles are needed under the CSP.
- **Sound cue.** A 220 Hz sine for 250 ms through Web Audio, enabled by a checkbox that is off on every load. The preference is not stored.

## Correctness Properties

### Property 1: State presentation is total

*For any* haunting state and score in [0, 100], the haunting view renders a non-empty headline, supporting line and icon label, and sets `data-state` to that state.

**Validates: Requirements 1.1, 1.4**

### Property 2: Score display

*For any* smoothed score in [0, 1], the displayed value is `round(score × 100)` and is an integer in [0, 100].

**Validates: Requirements 1.2**

### Property 3: Flash rate bound

*For any* sequence of Possession frames over any time window of 1 second, the Spectre schedules at most 3 displacement updates.

**Validates: Requirements 3.2**

### Property 4: Token contrast

*For any* pair in `contrast-pairs.json`, the computed contrast ratio meets its target.

**Validates: Requirements 7.2**

### Property 5: Test state mode is dev-only

*For any* URL query, the production build's state is not influenced by `test-state`.

**Validates: Requirements 8.2**

## Error Handling

- Canvas unavailable: the Spectre area shows the state icon at a large size instead.
- PiP request rejected (for example, no user gesture): show "Your browser blocked the floating window. Click the button again." and offer compact mode.

## Testing Strategy

- fast-check tests for Properties 1 to 3 and 5; Property 4 as a parameterized test over the JSON file.
- Playwright screenshots of all six states at 375 px and 1440 px, with full and reduced motion (also run by the `haunt-snapshots` hook).
- axe-core check in Playwright for each state.
- Manual review by the `haunter` custom agent before the checkpoint.
