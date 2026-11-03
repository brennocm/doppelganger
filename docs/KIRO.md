# How Doppelgänger was built with Kiro

<!-- PENDING-GATE: draft written before the go/no-go gate (submission task 2.3). Every
     PENDING-GATE comment below marks a gap to fill from the journal after the gate, the
     developer's Kiro IDE session or the video. Run `node scripts/journal-digest.mjs` for the
     raw material, then the `exorcist` agent over this file (task 2.4). -->

## Summary

Doppelgänger is an on-device voice-clone detector for browser calls. It was built spec-first: 11 specs in [`.kiro/specs/`](../.kiro/specs/), implemented task by task. Ten project hooks guard privacy, tests and the logs. Three custom agents reviewed security, UI and the model lab. Four MCP servers are configured, and a custom MCP server and a Kiro power wrap our own detector. Every claim below comes from [the journal](kiro-journal.md), the prompt log or the repository.

<!-- PENDING-GATE: one line on the model that shipped and its gate result, from docs/model-card.md. -->

## Kiro surfaces: IDE, CLI, Web, Crew

- **CLI.** 41 journal entries were made through the Kiro CLI, and 19 prompts are logged in [`docs/prompt-history.md`](prompt-history.md). The CLI drove long autonomous runs with fixed rules, for example prompt 013 ("decide reversible things and record them as P-numbers, spec before code, one commit per step, never push, never commit red").
- **Hooks on the V3 engine.** Every hook was dry-run in a `kiro-cli` 2.37.0 session on the V3 engine; see the journal entry "kiro-workbench task 1.7: hook dry runs on CLI V3, two hook bugs, and the Turn_Report".

<!-- PENDING-GATE: kiro-workbench 3.4 — the IDE session with a custom agent, and the
     differences from the CLI. Web and Crew: say whether they were used; never imply they were. -->

## Spec-driven development

- **Structure.** Each spec has `requirements.md` (EARS: `WHEN … THE <System> SHALL …`), `design.md` with numbered correctness properties, and `tasks.md`. The 11 specs hold 47 correctness properties, for example 13 in [`detection-core`](../.kiro/specs/detection-core/design.md) and 6 in [`local-runtime`](../.kiro/specs/local-runtime/design.md).
- **Decisions are spec edits first.** Every decision made during implementation got a P-number in the owning design before the code changed (up to P48 at the time of writing). For example, [`audio-capture` P47](../.kiro/specs/audio-capture/design.md) defines test-only replay signals before the end-to-end tests used them, and [`submission` P48](../.kiro/specs/submission/design.md) defines the release check before the script existed.
- **One example, requirement to property to fix.** The developer made Exorcised sticky (prompt 016). Detection-core Requirements 5.2 and 5.3 and Property 9 changed first. The golden vectors were then regenerated, and a new case was added because no existing case could tell the old rule from the new one. See the journal entry "Developer decisions from prompt 016: sticky Exorcised, deferred engine score source".
- **Versus vibe coding.** Small fixes outside any spec were made directly and noted in the journal, as the [workflow steering](../.kiro/steering/kiro-workflow.md) requires. Three spec changes committed overnight without a number were numbered afterwards, each with a reason and a revert path; see the journal entry "Spec changes made overnight without a proposal number (P20–P22)".

## Steering

- **Always-on versus fileMatch.** Six steering files are always included ([product](../.kiro/steering/product.md), [security](../.kiro/steering/security.md), [tech](../.kiro/steering/tech.md), [structure](../.kiro/steering/structure.md), [testing](../.kiro/steering/testing.md), [workflow](../.kiro/steering/kiro-workflow.md)). Two load by file match: [design-system](../.kiro/steering/design-system.md) for the web, landing and token code, and [ml-honesty](../.kiro/steering/ml-honesty.md) for the model lab, detector, engine and landing. Two are manual.
- **The biggest lever: security and ml-honesty.** The security steering sets the zero-disk, no-upload and loopback-only rules that the `zero-disk-guard` hook and the `exorcist` agent check against. ml-honesty forbids invented numbers and faked detections. That is why the landing shows the model card's numbers with their date or no numbers at all, and why every pre-gate placeholder in this repository carries a marker that `scripts/release-check.sh` refuses to ship.

## Agent hooks

| Hook | Trigger | What it did (journal) |
| --- | --- | --- |
| [`secret-sentinel`](../.kiro/hooks/secret-sentinel.json) | file save | Flagged a four-part kernel version string as an IPv4 address. It was a false positive, but the fixture (5886356) and a journal sentence (426a0b6) were reworded so the scan stays quiet. |
| [`test-affected`](../.kiro/hooks/test-affected.json) | file save | Ran the owning package's tests on each save. It reported the MCP sandbox test failing after prompt 017 called it fixed, which led to the independent oracle (prompt 018 entry). |
| [`zero-disk-guard`](../.kiro/hooks/zero-disk-guard.json) | file save (agent) | Reviewed every saved web, engine and detector file against the security steering. |
| [`spec-lint`](../.kiro/hooks/spec-lint.json) | spec save (agent) | Checked requirement references and Validates lines on each spec edit. |
| [`token-contrast`](../.kiro/hooks/token-contrast.json) | token save | Rebuilt the design tokens and asserted 35 contrast pairs after each change. |
| [`contracts-codegen`](../.kiro/hooks/contracts-codegen.json) | schema save | Regenerated the TS and Python types from the JSON Schemas. |
| [`prompt-logger`](../.kiro/hooks/prompt-logger.json) | prompt submit | Appends each prompt, redacted, to the prompt log; it is the only writer of new entries. |
| [`journal-keeper`](../.kiro/hooks/journal-keeper.json) | prompt submit and stop | Snapshots the tree at turn start; when a turn changed files without a journal update, asks once for an entry. |
| [`hook-findings`](../.kiro/hooks/hook-findings.json), [`hook-findings-turn-start`](../.kiro/hooks/hook-findings-turn-start.json) | stop and prompt submit | Deliver the masked findings of the command hooks to the agent once per turn. |

## Custom agents

- **[`exorcist`](../.kiro/agents/exorcist.json)** (security, read-only). Over the installer it found two medium issues: `DOPPELGANGER_RELEASE_URL` let anyone swap the source of `SHA256SUMS`, and a web tarball with a symlink could expose files through `http.server`. Both were fixed with regression tests (prompt 017 entry). Over the Pro engine it found one high, one medium and six lows (journal entry "local-runtime 1–4 (+ container files): the Pro engine (P29) and an exorcist pass").
- **[`haunter`](../.kiro/agents/haunter.json)** (UI and accessibility, drives the browser through the Playwright MCP server). On the haunted UI it found 3 highs, 7 mediums and 10 lows. On the landing page it found three highs, including a proof step that was false for replays and install commands cut off at 375 px.
- **[`necromancer`](../.kiro/agents/necromancer.json)** (model lab, writes only in `packages/model-lab`).

<!-- PENDING-GATE: necromancer's part in the gate run (detection-model 4.1), from the journal. -->

## MCP

- **Third-party servers** in [`.kiro/settings/mcp.json`](../.kiro/settings/mcp.json): Playwright (state snapshots for `haunter` and the `/haunt-snapshots` command), documentation, Hugging Face (candidate model search, recorded in [`CANDIDATES.md`](../packages/model-lab/CANDIDATES.md)) and GitHub.
- **The custom Doppelganger MCP server** ([`packages/doppelganger-mcp`](../packages/doppelganger-mcp/)) exposes `analyze_audio_file`, `list_models` and `explain_thresholds`, running the engine's own Autopsy code. Its path sandbox is Property 1 and is checked by a hand-written strict-realpath oracle.

<!-- PENDING-GATE: kiro-workbench 5.6 — Kiro analyzing the real replay clips through the
     custom server, with the journal entry and a screenshot. -->

## Property-based testing

- **Where.** 47 properties across 10 specs, tested with fast-check (TypeScript) and Hypothesis (Python). For example: resampler length and range in [`audio-capture`](../.kiro/specs/audio-capture/design.md), the size guard in [`local-runtime`](../.kiro/specs/local-runtime/design.md), the MCP path sandbox in [`kiro-workbench`](../.kiro/specs/kiro-workbench/design.md), and journal digest completeness in [`submission`](../.kiro/specs/submission/design.md).
- **What it caught, honestly.** In detection-core, no property test found a product bug that the example tests missed. Property 13 did fail on its first run, but the fault was in the test (journal entry "detection-core: windower, scoring, haunting machine, pipeline (P23)"). The sandbox property was different. Hypothesis found three paths the test's own oracle judged wrongly, including `inside.wav/../inside.wav`, and each shrunk counterexample is now a unit test. The reviewer then caught that one "fix" made the oracle call the code under test. The final oracle uses only `lstat` and `readlink`, and a mutation check shows it fails on a sandbox without symlink resolution (prompt 018 entry).

## Kiro powers

- **The Doppelgänger power** ([`powers/doppelganger/`](../powers/doppelganger/)) packages the MCP reference, steering and keywords in the current Agent Plugins format; see kiro-workbench P37.

<!-- PENDING-GATE: kiro-workbench 6.2 — installing the power in a clean workspace and testing it on a fixture. -->

## Prompt history highlights

19 prompts are logged in [`docs/prompt-history.md`](prompt-history.md), each with its outcome.

<!-- PENDING-GATE: 3 to 5 annotated prompts and the per-surface count, from the final log. -->

## Setbacks and corrections

- **A flaky test reported as fixed.** The prompt 017 report called the sandbox property test fixed while it still failed 2 runs in 5. The next fix made the oracle depend on the code under test. Both are recorded in the journal entry "The sandbox oracle was not fixed, and then it checked itself (prompt 018)".
- **A race between test sessions.** Turning off pytest's tmp_path retention removed its session lock, so the `test-affected` hook and a check deleted each other's folders (P41).
- **An SDK behaviour, not our bug.** The MCP SDK drops in-flight requests when stdin closes. A bare SDK server showed the same drop rate, so it was recorded (P42) instead of patched.

<!-- PENDING-GATE: the gate result and anything that had to change because of it. -->

## What we would do next

<!-- PENDING-GATE: written after the gate and the video. -->
