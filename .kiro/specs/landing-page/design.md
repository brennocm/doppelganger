# Design Document

## Overview

**Mode:** Persuade. **One idea:** the same calm interface you trust turning on you. **Signature:** the opening capture, the real app going from Mask to Possession, shown large and uncropped. No feature-card grids, no eyebrow labels, no testimonials. Sections exist because the content needs them.

## Brief

- **Visitor and task:** a judge with limited time who must decide whether this is impressive and real. Task: try the demo or watch the video.
- **Real content:** the app capture, one scam scenario, the privacy proof, the tier table, the limits, the build story.
- **Most important element:** the app capture and the "Try the live demo" action.
- **World:** a séance parlour meets a security operations console, framed in Kiro's own surfaces.

## Page outline

```text
┌──────────────────────────────────────────────────────────────┐
│ Doppelgänger                                    GitHub  Video│
│                                                              │
│ Hear a cloned voice before it costs you.                     │
│ A call companion that runs in your browser and warns you     │
│ when the voice on the other end is synthetic.                │
│ [Try the live demo]   Watch the 3-minute video               │
│                                                              │
│ ┌──────────────────── app capture (Mask → Possession) ─────┐ │
│ └──────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ The call  →  The alert  →  The protocol   (one scenario)     │
├──────────────────────────────────────────────────────────────┤
│ Check it yourself: nothing leaves your device (Proof_Panel)  │
├──────────────────────────────────────────────────────────────┤
│ Run it your way: tier comparison table + install commands    │
├──────────────────────────────────────────────────────────────┤
│ Limits (from the model card, dated)                          │
├──────────────────────────────────────────────────────────────┤
│ How it was built with Kiro: specs, hooks, steering, MCP …    │
├──────────────────────────────────────────────────────────────┤
│ Video facade                                                 │
│ Footer: license, repository, "Built with Kiro for Kiroween"  │
└──────────────────────────────────────────────────────────────┘
```

The headline copy above is a draft; final copy follows the design-system voice and is reviewed by the `haunter` agent.

## Components and Interfaces

- Plain HTML and CSS built with Vite (multi-page not needed). One small TS module for the video facade, the copy buttons and the reduced-motion swap of the capture.
- The capture is a muted, looping `<video>` (AV1/H.264, under 2 MB) with a poster frame, `preload="none"` and lazy start when visible; under reduced motion only the poster is shown.
- Video facade: a `<button>` with the poster image and an accessible label; on click it inserts the `youtube-nocookie.com` iframe.
- The evaluation numbers are imported at build time from `packages/model-lab/reports/latest/summary.json`, so the page can't drift from the model card.

## Data Models

None beyond the build-time import of the evaluation summary.

## Correctness Properties

### Property 1: No third-party requests before consent

*For any* page load without a click on the facade, the set of requested origins is exactly {self}.

**Validates: Requirements 7.1**

### Property 2: Numbers come from the report

*For any* number rendered in the Limits section, its value equals the corresponding value in the imported evaluation summary.

**Validates: Requirements 5.2**

## Error Handling

- If the evaluation summary is missing at build time, the Limits section renders without numbers and the build prints a warning.

## Testing Strategy

- Playwright: record network requests on load (Property 1); click the facade and assert only `youtube-nocookie.com` is added.
- Build test for Property 2.
- Lighthouse CI budget check for page weight; axe-core at 375 px and 1440 px.
