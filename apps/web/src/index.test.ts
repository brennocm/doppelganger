import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.ts";

describe("@doppelganger/web", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@doppelganger/web");
  });
});
