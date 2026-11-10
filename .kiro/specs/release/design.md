# Design Document

## Overview

The release is assembled from artifacts that already exist: the journal, the specs, the hooks, the evaluation reports and the app itself. Nothing is written from memory at the end.

## Write-up structure (`docs/KIRO.md`)

```text
# How Doppelgänger was built with Kiro
## Summary (5 lines)
## Kiro surfaces: IDE, CLI, Web, Crew
## Spec-driven development
   - the specs, order, EARS requirements, correctness properties, tasks
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
- `scripts/release-check.sh`: checks the public URLs (demo, repository) return 200 from an unauthenticated request, the license file exists, `.kiro/` is tracked, and a full-history gitleaks run is clean.

### Release check and journal digest (P48, 2026-11-02)

- **`scripts/release-check.sh`** runs from the repository root, runs every check even after a failure, prints one `release-check: FAIL <check>: <detail>` line per problem and a final count, and exits 1 if anything failed. Checks:
  1. *Pending markers in tracked files.* `git grep` for `PENDING-GATE`, listing `file:line`. Files that define, detect or quote the marker are skipped, each for a reason written next to it in the script: the logs (`docs/prompt-history.md`, `docs/kiro-journal.md`), the specs (`.kiro/specs/`), the release check and its test, and end-to-end test code and fixtures (`*/e2e/`), which are never built into Pages.
  2. *Pending markers in the built output.* The same search over `dist/pages` (built first with `scripts/build-pages.sh` unless `--dist DIR` names an existing build) and over `release/` when it exists.
  3. *License.* `LICENSE` exists and is the MIT license.
  4. *Kiro files.* `.kiro/` is tracked and not ignored.
  5. *Secrets.* `gitleaks git --redact --no-banner .` over the full history is clean.
  6. *Public URLs.* The repository, the demo and the landing's `app/` answer 200 to an anonymous `curl -q` with no credentials. `--offline` skips this check and says so.
  It is not part of `mise run check` or `check:all`, because it needs the network and a published site.
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
