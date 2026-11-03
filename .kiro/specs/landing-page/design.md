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
- The evaluation numbers are imported at build time from the evaluation report, so the page can't drift from the model card.

### Implementation details (P38)

- **Report source.** The harness writes `packages/model-lab/reports/<YYYY-MM-DD>/results.json` (detection-model Requirement 2.4). No `reports/latest/summary.json` exists, so the build reads the newest dated `results.json`. A report whose label contains "synthetic dry run" is refused; dry runs are never written there anyway.
- **Build-time rendering.** A Vite plugin in `apps/landing/vite.config.ts` replaces the `<!-- evaluation -->` marker in `index.html` with HTML from `renderEvaluation(report)` in `src/evaluation.ts`. That function is pure and has no DOM. The Limits section therefore needs no JavaScript at run time. Every string taken from the report is HTML-escaped.
- **What is shown.** The run date and, per candidate, the model ID and one row per dataset and Codec_Condition, with ROC AUC (3 decimals), EER and the false-alarm rate after smoothing (percent, 1 decimal). Those are the gate's numbers (detection-model Requirement 3.1). A null value shows as "n/a". Without a report, the section keeps its text, shows no numbers, and the build prints a warning (Error Handling).
- **Copy.** Section copy follows the design-system voice. Only the scenario uses numbers, and it uses none. Links into the repository point at `https://github.com/brennocm/doppelganger/` paths. The model card link points at `docs/model-card.md`, which detection-model task 7.1 writes.
- **Hero media and video.** The capture (Requirement 1.2) and the video facade (Requirement 7.1) are task 2. Until then, the secondary action links to the `#video` section, which says the video is not published yet.
- **Not yet linked (haunter review, 2026-11-02).** The write-up (Requirement 6.1) is written by the `submission` spec. The page links it once it exists, and until then it links the journal and the prompt history. The hero headline uses `--type-hero` (added 2026-11-03 at the developer's request, in the landing redesign).
- **Proof wording.** A replay downloads its labelled clip from this site. The Proof_Panel therefore says that every request goes to this site and only downloads files, and that nothing is sent back. It does not claim that no request carries audio.
- **Interaction.** `src/index.ts` adds only the copy buttons for the install commands (`navigator.clipboard`, with a text fallback that selects the command). The page is complete without JavaScript.

### Pending content, video facade and capture slot (P46)

- **Content file.** `apps/landing/content.json` holds everything that waits for the go/no-go gate: `videoId` (an 11-character YouTube ID), `writeUpUrl`, and `capture` (`video`, `poster`, `alt`, where video and poster are files under `public/media/`). A pending value is the marker `PENDING-GATE`, so the pending state is data. `src/content.ts` is pure and holds the only code that reads the marker. It validates real values (ID pattern, `https://github.com/brennocm/doppelganger/` links, `media/` file names that exist) and fails the build on a bad one.
- **Neutral states.** The marker never appears in the built page.
  - *Video pending:* the Video section says "The 3-minute video is not published yet." and the Content-Security-Policy stays the base policy.
  - *Video set:* the section holds the Video_Facade and the policy gains `frame-src https://www.youtube-nocookie.com` and nothing else (Requirement 7.2), which `verify-pages` already allows for the root page only.
  - *Write-up pending:* the "How it was built" list omits the write-up item.
  - *Capture pending:* the hero shows no capture.
- **Facade.** A `<button class="video-facade">` with the poster image and the label "Play the 3-minute video". It carries the embed URL in `data-embed`, which `verify-pages` does not read as a resource. On the first click, `src/index.ts` replaces the button with an `<iframe>` of that URL (`allow=""`, `referrerpolicy="no-referrer"`, `loading="lazy"`). The script accepts only URLs that match `youtube-nocookie.com/embed/<id>` and keeps the host out of its source as a plain URL, because `verify-pages` rejects absolute URLs in emitted scripts. Before the click the page requests nothing outside its own origin (Property 1).
- **Capture slot.** `<figure class="capture">` with the poster `<img>` always present. Unless the visitor prefers reduced motion, `src/index.ts` swaps in a muted, looping `<video preload="none" playsinline>` when the figure first becomes visible (`IntersectionObserver`), so the clip is lazy-loaded (Requirement 7.3). Under reduced motion only the poster is shown (Requirement 1.2). Recording the real capture is task 2.1.
- **Build switches for tests.** `LANDING_CONTENT` (path to a content file) and `LANDING_PUBLIC` (public folder) override the defaults. The end-to-end build uses `e2e/fixtures/content.test.json` and `e2e/fixtures/public/`: a placeholder SVG poster and a silent MP4 of 1280 × 720 pixels, both under 2 MB and marked `PENDING-GATE`. They are test fixtures and are never part of the Pages build.
- **Verification.** Playwright (`pnpm --filter @doppelganger/landing run e2e`) builds both variants and serves them on loopback: the real content (everything pending) and the test content (facade and capture present). It checks Property 1 for both 375 px and 1440 px with and without reduced motion, the page weight (HTML, scripts, styles and images, with the capture not yet loaded, under 500 KB), the lazy capture, and axe-core at both widths for both variants. The e2e task is part of `check:all`.

## Data Models

`content.json` (above) and the build-time evaluation summary.

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
