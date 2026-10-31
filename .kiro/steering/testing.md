---
inclusion: always
---

# Testing strategy

## Layers

| Layer | Tooling | Scope |
| --- | --- | --- |
| Property-based | `fast-check` (TS), Hypothesis (Python) | Every correctness property listed in a spec's `design.md` |
| Unit | Vitest, pytest | Example cases, edge cases, error paths |
| Integration | Vitest with fixture audio, pytest with FastAPI `TestClient` | Worker ↔ detector, engine HTTP and WebSocket |
| E2E and visual | Playwright | Critical journeys and each haunting state at 375px and 1440px, with and without reduced motion |

## Property-based testing rules

- Each property in a `design.md` "Correctness Properties" section gets exactly one property test.
- Tag each property test with a comment in this format: `Feature: <spec-name>, Property <n>: <short title>`.
- At least 200 runs per property in CI (`numRuns: 200`, `max_examples=200`). Use fixed seeds when reproducing a failure, and add the shrunk counterexample as a regular unit test.
- Generators must cover edge values: empty arrays, single samples, NaN and ±Infinity, values exactly at thresholds, very long sequences.

## Determinism

- No network, real microphone, real clock or random values without an injected seed in unit or property tests.
- No audio files are committed outside `apps/web/public/replay/` (see the security steering). Test audio is synthetic and generated at test time from seeded generators: sine waves, noise, silence and chirps, a few seconds long at most.
- When a tool needs an audio file (for example Playwright's fake audio capture), test setup writes it to a git-ignored temporary directory and removes it afterwards.
- Cross-language consistency: `packages/contracts/fixtures/golden/*.json` holds golden vectors (windowing, PCM16 encoding, calibration). Both the TS and Python test suites assert against the same files.

## Definition of done

A task is complete only when `mise run check` passes and the related properties have tests. UI tasks also need a Playwright screenshot of every state the task touches.
