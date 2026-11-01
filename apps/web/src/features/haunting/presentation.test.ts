import type { HauntingState } from "@doppelganger/contracts";
import { HAUNTING_STATES } from "@doppelganger/detector";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { displayScore, STATE_COPY } from "./copy.ts";
import { present, primaryAction, STATE_ICONS } from "./presentation.ts";
import { parseTestState } from "./test-state.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;
const state = fc.constantFrom<HauntingState>(...HAUNTING_STATES);

describe("presentation", () => {
  it("uses the design-system headlines verbatim", () => {
    expect(STATE_COPY.possession.headline).toBe("Doppelgänger detected");
    expect(STATE_COPY.unease.line).toBe("This voice shows some synthetic traits. Keep listening.");
  });

  it("keeps one primary action per state (Requirement 6.2)", () => {
    expect(primaryAction("idle")).toBe("listen");
    expect(primaryAction("possession")).toBe("protocol");
    for (const s of ["listening", "mask", "unease", "exorcised"] as const)
      expect(primaryAction(s)).toBe("stop");
  });

  it("shows a dash before the first score", () => {
    expect(present("listening", null).score).toBe("–");
  });

  // Feature: haunted-ui, Property 1: State presentation is total
  it("renders a headline, line and icon label for every state and score", () => {
    fc.assert(
      fc.property(state, fc.integer({ min: 0, max: 100 }), (s, score) => {
        const p = present(s, score / 100);
        expect(p.state).toBe(s);
        expect(p.headline.length).toBeGreaterThan(0);
        expect(p.line.length).toBeGreaterThan(0);
        expect(p.iconLabel.length).toBeGreaterThan(0);
        expect(p.icon).toBe(STATE_ICONS[s]);
      }),
      RUNS,
    );
    // Distinct text and icon per state, so color is never the only signal (Requirement 1.4).
    expect(new Set(HAUNTING_STATES.map((s) => STATE_COPY[s].headline)).size).toBe(6);
    expect(new Set(HAUNTING_STATES.map((s) => STATE_ICONS[s])).size).toBe(6);
  });

  // Feature: haunted-ui, Property 2: Score display
  it("displays round(score × 100) as an integer in [0, 100]", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (smoothed) => {
        const shown = displayScore(smoothed);
        expect(shown).toBe(Math.round(smoothed * 100));
        expect(Number.isInteger(shown)).toBe(true);
        expect(shown).toBeGreaterThanOrEqual(0);
        expect(shown).toBeLessThanOrEqual(100);
      }),
      RUNS,
    );
    expect(displayScore(Number.NaN)).toBe(0);
    expect(displayScore(1.5)).toBe(100);
  });
});

describe("parseTestState (Requirement 8)", () => {
  it("forces a state and score outside production", () => {
    expect(parseTestState("?test-state=unease&score=55", "e2e")).toEqual({
      state: "unease",
      smoothed: 0.55,
    });
    expect(parseTestState("?test-state=mask", "development")?.state).toBe("mask");
    expect(parseTestState("?test-state=ghost", "development")).toBeNull();
    expect(parseTestState("?test-state=mask&score=300", "e2e")?.smoothed).toBe(0.12);
  });

  // Feature: haunted-ui, Property 5: Test state mode is dev-only
  it("ignores every query in production", () => {
    const query = fc.oneof(
      fc.string(),
      fc
        .tuple(state, fc.string())
        .map(([s, score]) => `?test-state=${s}&score=${encodeURIComponent(score)}`),
      fc
        .tuple(state, fc.integer({ min: 0, max: 100 }))
        .map(([s, n]) => `test-state=${s}&score=${n}`),
    );
    fc.assert(
      fc.property(query, (search) => {
        expect(parseTestState(search, "production")).toBeNull();
      }),
      RUNS,
    );
  });
});
