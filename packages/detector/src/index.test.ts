import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.ts";

describe("@doppelganger/detector", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@doppelganger/detector");
  });
});
