import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPairs, contrast, loadTokens, renderCss, renderTs } from "../tools/build.ts";
import { PACKAGE_NAME, tokens } from "./index.ts";

const { tokens: source, pairs } = loadTokens();

describe("@doppelganger/tokens", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@doppelganger/tokens");
    expect(tokens.color.bg).toBe("#131116");
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 10);
    expect(contrast("#777777", "#777777")).toBe(1);
    // The design-system steering's documented failures of the original values.
    expect(contrast("#5E5966", source.color["surface-input"] ?? "")).toBeLessThan(4.5);
    expect(contrast("#4A464F", source.color["surface-button"] ?? "")).toBeLessThan(3);
    expect(contrast("#47306C", source.color["surface-input"] ?? "")).toBeLessThan(3);
  });

  // Feature: haunted-ui, Property 4: Token contrast
  it.each(checkPairs(source, pairs).map((r) => [`${r.fg} on ${r.bg}`, r] as const))(
    "%s meets its target",
    (_, result) => {
      expect(result.ratio).toBeGreaterThanOrEqual(result.target);
    },
  );

  it("committed generated files match tokens.json", () => {
    const read = (name: string) =>
      readFileSync(new URL(`../generated/${name}`, import.meta.url), "utf8");
    expect(read("tokens.css")).toBe(renderCss(source));
    expect(read("tokens.ts")).toBe(renderTs(source));
  });

  it("has only uppercase #RRGGBB colors", () => {
    for (const value of Object.values(source.color)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });
});
