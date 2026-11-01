import type { HauntingState } from "@doppelganger/contracts";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpectre, shapeFor } from "./spectre.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;

/** A canvas with a do-nothing 2D context; drawing calls are irrelevant here. */
function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  return {
    width: 0,
    height: 0,
    clientWidth: 640,
    clientHeight: 120,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

let frames: (() => void)[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSpectre", () => {
  // The renderer-level check of haunted-ui Property 3 (the scheduler alone is tested in
  // spectre-geometry.test.ts): first frames, state changes and motion changes included.
  it("draws at most 3 new tears in any second of Possession", () => {
    const event = fc.oneof(
      {
        weight: 6,
        arbitrary: fc.integer({ min: 1, max: 120 }).map((dt) => ({ kind: "frame" as const, dt })),
      },
      {
        weight: 1,
        arbitrary: fc
          .constantFrom<HauntingState>("possession", "unease")
          .map((state) => ({ kind: "state" as const, state })),
      },
      {
        weight: 1,
        arbitrary: fc
          .constantFrom("full" as const, "reduced" as const)
          .map((motion) => ({ kind: "motion" as const, motion })),
      },
    );
    fc.assert(
      fc.property(fc.array(event, { maxLength: 150 }), (events) => {
        let now = 0;
        const tears: number[] = [];
        const spectre = createSpectre(
          fakeCanvas(),
          "full",
          () => now,
          (t) => tears.push(t),
        );
        const bands = new Float32Array(64).fill(0.5);
        spectre.draw({ bands, state: "possession", intensity: 0 });
        for (const e of events) {
          if (e.kind === "frame") now += e.dt;
          else if (e.kind === "state") spectre.draw({ bands, state: e.state, intensity: 0 });
          else spectre.setMotion(e.motion);
          for (const fn of frames.splice(0)) fn();
        }
        for (let i = 0; i + 3 < tears.length; i++) {
          expect((tears[i + 3] ?? 0) - (tears[i] ?? 0)).toBeGreaterThan(1000);
        }
        spectre.dispose();
      }),
      RUNS,
    );
  });

  it("does not re-tear when Possession is left and re-entered quickly", () => {
    let now = 0;
    const tears: number[] = [];
    const spectre = createSpectre(
      fakeCanvas(),
      "full",
      () => now,
      (t) => tears.push(t),
    );
    const bands = new Float32Array(64).fill(0.5);
    for (let i = 0; i < 20; i++) {
      spectre.draw({ bands, state: i % 2 === 0 ? "possession" : "unease", intensity: 0 });
      now += 50;
      for (const fn of frames.splice(0)) fn();
    }
    // 1 s of flipping every 50 ms: at most 3 tears.
    expect(tears.length).toBeLessThanOrEqual(3);
    spectre.dispose();
  });
});

describe("shapeFor", () => {
  const bands = new Float32Array(64).fill(0.6);
  it("gives each state its own shape", () => {
    expect(Array.from(shapeFor("idle", bands, 0, "full")).every((v) => v === 0)).toBe(true);
    expect(shapeFor("listening", bands, 0, "full")[0]).toBeCloseTo(0.14, 6);
    expect(shapeFor("exorcised", bands, 0, "full")[0]).toBeCloseTo(0.27, 6);
    expect(shapeFor("mask", bands, 0, "full")).toBe(bands);
  });
});
