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

### Release check and journal digest (P48, 2026-11-02)

- **`scripts/release-check.sh`** runs from the repository root, runs every check even after a failure, prints one `release-check: FAIL <check>: <detail>` line per problem and a final count, and exits 1 if anything failed. Checks:
  1. *Pending markers in tracked files.* `git grep` for `PENDING-GATE`, listing `file:line`. Files that define, detect or quote the marker are skipped, each for a reason written next to it in the script: the logs (`docs/prompt-history.md`, `docs/kiro-journal.md`), the specs (`.kiro/specs/`), the release check and its test, the landing's marker reader (`apps/landing/src/content.ts` and its test) and end-to-end test code and fixtures (`*/e2e/`), which are never built into Pages.
  2. *Pending markers in the built output.* The same search over `dist/pages` (built first with `scripts/build-pages.sh` unless `--dist DIR` names an existing build) and over `release/` when it exists.
  3. *License.* `LICENSE` exists and is the MIT license.
  4. *Kiro files.* `.kiro/` is tracked and not ignored.
  5. *Secrets.* `gitleaks git --redact --no-banner .` over the full history is clean.
  6. *Public URLs.* The repository, the demo, the landing's `app/`, and the video (from `apps/landing/content.json`, skipped while it is pending, because check 1 already reports it) answer 200 to an anonymous `curl -q` with no credentials. `--offline` skips this check and says so.
  It is not part of `mise run check` or `check:all`, which stay green while markers exist.
- **`scripts/journal-digest.mjs [journal]`** prints a Markdown digest of `docs/kiro-journal.md` to stdout. It reads entries (`## YYYY-MM-DD — title` headings outside code fences) and their `Kiro surface` and `Feature used` lines. Each entry goes into exactly one group: the first feature it lists, or `unclassified` when it lists none. The entry line names the other features (`also: hook, PBT`), so the write-up can still find an entry under every feature it used. A table counts entries per surface. The feature groups come out in the template order (spec, hook, steering, MCP, custom agent, power, PBT), then any other feature in order of first appearance, then `unclassified`.

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
