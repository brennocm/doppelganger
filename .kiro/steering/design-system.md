---
inclusion: fileMatch
fileMatchPattern: "{apps/web,apps/landing,packages/tokens}/**"
---

# Design system: Kiro, haunted

The base is the Kiro product palette. The Halloween layer adds only what the haunting states need. Every value lives in `packages/tokens` and reaches the UI as CSS custom properties. Raw hex values in components are not allowed.

## Base (Kiro)

**Backgrounds:** `bg-top #1E1826`, `bg #131116`, `bg-deep #0A090B`, `bg-glow #0E1017`.

```css
background:
  radial-gradient(60% 50% at 100% 100%, #0E1017, transparent),
  linear-gradient(180deg, #1E1826 0%, #131116 50%, #0A090B 100%);
```

This page background gradient is part of the Kiro brand. It is the only decorative gradient allowed.

**Surfaces:** `surface-button #131313`, `surface-input #1F1B23`, `surface-sidebar #211D25`, `surface-control #28242E`, `surface-chip #352F3D`, `surface-avatar #413C49`.

**Text:** `text #FFFFFF`, `text-secondary #DCDADF`, `text-body #B7B5BC`, `text-muted #938F9B`, `text-subtle #716D75` (icons only).

**Brand violet:** `purple #B07FFF`, `on-purple #131116` (never white on purple), `purple-deep #432A6B`, `purple-ink #2A0A55` (decorative only).

**Info blue:** `info-surface #151721`, `info-line #356AC3`, `info-chip #285092`, `info-chip-text #AECDF5`.

## Contrast fixes (the original fails these)

| Token | Original | Use instead | Target |
| --- | --- | --- | --- |
| `text-placeholder` | `#5E5966` (2.5:1) | `#8C8794` | ≥ 4.5:1 on `surface-input` |
| `line-strong` | `#4A464F` (2.0:1) | `#6E6975` | ≥ 3:1 on `surface-button` |
| `purple-line` | `#47306C` (1.5:1) | `#7B5CB8` | ≥ 3:1 on `surface-input` |

The proposed values are starting points. The token build script must compute and assert every pair listed in `packages/tokens/contrast-pairs.json`, and the build fails if any pair misses its target.

## Halloween layer

| Token | Value | Role |
| --- | --- | --- |
| `ember` | `#FFA552` | Unease state accent (pumpkin) |
| `ember-deep` | `#4A2A12` | Unease surface tint |
| `blood` | `#FF5468` | Possession alert text and icon |
| `blood-deep` | `#3A0E16` | Possession surface tint |
| `ecto` | `#9CF27A` | Possession waveform (toxic ectoplasm) |
| `on-ecto` | `#131116` | Text on `ecto` |

## State → color mapping

| Haunting state | Accent | Surface | Waveform |
| --- | --- | --- | --- |
| Idle | `text-muted` | `bg` | Flat line |
| Listening (silence) | `info-chip-text` | `bg` | Low, slow breath |
| Mask (human) | `purple` | `bg` | Smooth, calm |
| Unease | `ember` | `ember-deep` tint | Jittering |
| Possession | `blood` (text) / `ecto` (wave) | `blood-deep` tint | Torn, glitched |
| Exorcised | `info-line` | `info-surface` | Settling back to calm |

Color never carries meaning alone. Every state also has a text label, an icon and a distinct waveform shape.

## Typography

- System UI stack (as in Kiro). Monospace only for data: the dissonance score, timestamps and model IDs, always with `font-variant-numeric: tabular-nums`.
- Scale: `display 26/32 600`, `title 14/20 600`, `body 13/20 400` (raise to 16px for reading text on the landing page), `label 13/16 500`, `small 12/16 500`, `legal 10/15 400`, `chip-mono 12/16 500 mono`.
- Sentence case for headings and buttons.

## Spacing and radius

- Spacing: `space-1 4px`, `space-2 8px`, `space-4 16px`, `space-6 24px` (add `space-8 32px` and `space-12 48px` for the landing page).
- Radius: `radius-sm 4px` (chips), `radius-md 6px` (buttons), `radius-lg 10px` (cards and panels), `radius-full` (toggle, avatar, round buttons).
- Elevation: border **or** shadow, never both. Shadows only on floating layers (the PiP widget, dialogs).

## Icons and mascot

- One icon set: Phosphor Icons (MIT), regular weight, 20px grid. Relevant glyphs: ghost, skull, eye, waveform, shield-check, phone-disconnect, warning.
- No emoji as icons.
- The mascot, "the Twin", is an **original** ghost SVG drawn for this project. It is calm in the Mask state and is visibly possessed in the Possession state. Do not copy or modify the Kiro logo. Use the name Kiro only in "Built with Kiro" wording.

## Motion and safety

- UI transitions ≤ 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, named properties only (never `transition: all`).
- Glitch effects exist **only** in the Possession state and must:
  - never flash more than **3 times per second** (WCAG 2.3.1);
  - never flash more than 25% of the viewport at once;
  - be replaced by a static "possessed" treatment under `prefers-reduced-motion: reduce`.
- The waveform renders on a single `<canvas>` with `requestAnimationFrame`. Pause rendering when the tab is hidden.

## Copy voice

Plain, specific, calm, slightly eerie. No hype words, no exclamation marks, no "Oops".

| State | Headline | Supporting line |
| --- | --- | --- |
| Idle | Not listening | Choose a call tab to start. |
| Listening | Waiting for a voice | Nothing to analyze yet. |
| Mask | Sounds human | Dissonance is low. |
| Unease | Something doesn't add up | This voice shows some synthetic traits. Keep listening. |
| Possession | Doppelgänger detected | Critical dissonance. Do not approve anything on this call. |
| Exorcised | Protocol completed | Stay alert for the rest of the call. |

## Browser surfaces

Theme `::selection`, `caret-color`, `accent-color`, the focus ring (`purple`, 2px, 2px offset), scrollbars and `theme-color` (`#131116`). Set `color-scheme: dark`.
