import fc from "fast-check";
import { describe, expect, it } from "vitest";
import golden from "../../contracts/fixtures/golden/calibration.json" with { type: "json" };
import { RUNS } from "./property-runs.ts";
import { score } from "./scorer.ts";

type Kind = "single-logit" | "two-class-logits";
const manifest = (outputKind: Kind, spoofIndex: number, temperature: number) => ({
  outputKind,
  spoofIndex,
  calibration: { method: "temperature" as const, temperature },
});

describe("score", () => {
  it.each(golden.cases.map((c, i) => [i, c] as const))("matches golden case %i", (_, c) => {
    const result = score(c.logits, manifest(c.outputKind as Kind, c.spoofIndex, c.temperature));
    expect(result.ok).toBe(true);
    if (result.ok) expect(Math.abs(result.score - c.score)).toBeLessThanOrEqual(golden.tolerance);
  });

  it("accepts the Float32Array that ONNX Runtime returns", () => {
    const result = score(Float32Array.of(0, 2), manifest("two-class-logits", 1, 1));
    expect(result).toEqual({ ok: true, score: 1 / (1 + Math.exp(-2)) });
  });

  it.each([
    ["NaN", [Number.NaN, 0], "two-class-logits"],
    ["+Infinity", [Number.POSITIVE_INFINITY, 0], "two-class-logits"],
    ["-Infinity", [Number.NEGATIVE_INFINITY], "single-logit"],
    ["too few values", [1], "two-class-logits"],
    ["too many values", [1, 2], "single-logit"],
    ["empty output", [], "single-logit"],
    ["an overflowing margin", [1.7e308, -1.7e308], "two-class-logits"],
  ] as const)("rejects %s", (_, logits, kind) => {
    expect(score(logits, manifest(kind, 1, 1))).toEqual({ ok: false, error: "invalid-output" });
  });

  it("rejects a manifest with a non-positive temperature or bad spoof index", () => {
    expect(score([0, 1], manifest("two-class-logits", 1, 0)).ok).toBe(false);
    expect(score([0, 1], manifest("two-class-logits", 2, 1)).ok).toBe(false);
  });

  // Feature: detection-core, Property 4: Score bounds and rejection
  it("returns a value in [0, 1] for finite outputs and invalid-output otherwise", () => {
    const value = fc.oneof(
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0),
    );
    const kind = fc.constantFrom<Kind>("single-logit", "two-class-logits");
    fc.assert(
      fc.property(
        kind,
        fc.integer({ min: 0, max: 1 }),
        fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
        fc.array(value, { minLength: 1, maxLength: 2 }),
        (k, spoof, temperature, logits) => {
          const result = score(logits, manifest(k, spoof, temperature));
          const length = k === "single-logit" ? 1 : 2;
          const finite = logits.every(Number.isFinite);
          const margin = k === "single-logit" ? 0 : (logits[0] ?? 0) - (logits[1] ?? 0);
          if (!finite || logits.length !== length || !Number.isFinite(margin)) {
            expect(result).toEqual({ ok: false, error: "invalid-output" });
          } else {
            expect(result.ok).toBe(true);
            if (result.ok) {
              expect(result.score).toBeGreaterThanOrEqual(0);
              expect(result.score).toBeLessThanOrEqual(1);
            }
          }
        },
      ),
      RUNS,
    );
  });
});
