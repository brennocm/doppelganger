# Design Document

## Overview

The submission is assembled from artifacts that already exist: the journal, the specs, the hooks, the evaluation reports and the app itself. Nothing is written from memory at the end.

## Video script (target 2:50)

| Time | Scene | On screen | Voice-over (draft) |
| --- | --- | --- | --- |
| 0:00–0:20 | The threat | A video call; a familiar voice asks for an urgent transfer | "This is my voice. Except it isn't. It took a few minutes of public audio to clone it." |
| 0:20–0:45 | The mask | Doppelgänger beside the call in Mask; the floating widget | "Doppelgänger listens to the call tab, on this laptop, and stays quiet while the voice sounds human." |
| 0:45–1:25 | The possession | The clone speaks; Unease, then the possession sequence | "When the evidence holds for a few seconds, the mask comes off." |
| 1:25–1:50 | The protocol | The checklist; copy the incident summary | "An alarm alone doesn't help. It tells you what to do next." |
| 1:50–2:10 | Proof | DevTools network panel with no requests during detection; offline mode | "No audio leaves this device. You can check it yourself." |
| 2:10–2:45 | Built with Kiro | Specs and tasks, a hook catching a privacy regression, a PBT counterexample, the custom MCP server analyzing a file, the custom agents | "Kiro built it from specs, and its hooks and agents kept the privacy promise honest." |
| 2:45–2:50 | Close | Demo URL and repository | "Try it at …" |

Replay segments carry an on-screen "Replay" label. The consent note appears during the first clone segment: "Synthetic voice made from the author's own voice, with consent."

## Write-up structure (`docs/KIRO.md`)

```text
# How Doppelgänger was built with Kiro
## Summary (5 lines)
## Kiro surfaces: IDE, CLI, Web, Crew
## Spec-driven development
   - 11 specs, order, EARS requirements, correctness properties, tasks
   - one example: detection-core hysteresis from requirement → property → bug caught
   - versus vibe coding: what we did without specs and what happened
## Steering
   - always-on vs fileMatch; the security steering as the biggest lever (example)
## Agent hooks
   - table: hook, trigger, what it caught (from the journal)
## Custom agents
   - exorcist, haunter, necromancer: role, app used, findings
## MCP
   - Playwright (state snapshots), docs, Hugging Face (model search), GitHub
   - the custom Doppelganger MCP: Kiro analyzing audio with our own detector
## Property-based testing
   - properties per spec; counterexamples found (links)
## Kiro powers
   - powers used; the Doppelgänger power
## Prompt history highlights
   - prompt count per surface and per spec vs vibe; 3 to 5 annotated prompts (link to docs/prompt-history.md)
## Setbacks and corrections
## What we would do next
```

Each section is filled from journal entries filtered by their "Feature used" field.

## Components and Interfaces

- `scripts/journal-digest.mjs`: groups journal entries by feature and surface into a Markdown digest used while writing the Write_Up. It only reads `docs/kiro-journal.md`.
- `scripts/release-check.sh`: checks the public URLs (demo, video, repository) return 200 from an unauthenticated request, the license file exists, `.kiro/` is tracked, and a full-history gitleaks run is clean.

## Data Models

None.

## Correctness Properties

### Property 1: Journal digest completeness

*For any* well-formed journal, every entry appears in exactly one feature group of the digest.

**Validates: Requirements 2.2, 2.4**

## Error Handling

- `release-check.sh` prints each failing check and exits non-zero.

## Testing Strategy

- fast-check test for Property 1 over generated journals.
- A manual dry run of the submission form two days before the deadline.
