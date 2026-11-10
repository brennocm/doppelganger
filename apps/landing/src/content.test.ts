import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mediaFiles, parseContent, renderCapture, renderWriteUp } from "./content.ts";

const writeUpUrl = "https://github.com/brennocm/doppelganger/blob/main/docs/KIRO.md";
const capture = {
  video: "media/capture.mp4",
  poster: "media/capture-poster.svg",
  alt: "A capture.",
  caption: "Scores fixed by a test.",
};
const withCapture = { writeUpUrl, capture };

describe("content without a capture", () => {
  const content = parseContent({ writeUpUrl, capture: null });

  it("renders the write-up link and no capture", () => {
    expect(renderWriteUp(content)).toContain("docs/KIRO.md");
    expect(renderCapture(content)).toBe("");
    expect(mediaFiles(content)).toEqual([]);
  });

  it("treats a missing capture as none", () => {
    expect(parseContent({ writeUpUrl }).capture).toBeNull();
  });
});

describe("content with a capture", () => {
  const content = parseContent(withCapture);

  it("adds the capture with its poster and alt text", () => {
    expect(renderCapture(content)).toContain('data-video="./media/capture.mp4"');
    expect(renderCapture(content)).toContain('alt="A capture."');
    expect(renderCapture(content)).toContain("<figcaption>Scores fixed by a test.</figcaption>");
    expect(mediaFiles(content)).toEqual(["media/capture.mp4", "media/capture-poster.svg"]);
  });

  it("uses the page's base path for media", () => {
    expect(renderCapture(content, "/doppelganger/")).toContain("/doppelganger/media/capture.mp4");
  });
});

describe("validation", () => {
  it.each([
    [{ writeUpUrl: "https://example.com/x" }, "must start with"],
    [{ writeUpUrl: "javascript:alert(1)" }, "must start with"],
    [{ writeUpUrl: "" }, "writeUpUrl"],
    [{ ...withCapture, capture: { ...capture, video: "media/x.exe" } }, "media/<name>"],
    [{ ...withCapture, capture: { ...capture, poster: "../secret.png" } }, "media/<name>"],
    [{ ...withCapture, capture: { ...capture, alt: "" } }, "capture.alt"],
    [{ ...withCapture, capture: { ...capture, caption: undefined } }, "capture.caption"],
    [{ ...withCapture, capture: "media/capture.mp4" }, "object or null"],
    [null, "must be an object"],
  ])("rejects %j", (raw, message) => {
    expect(() => parseContent(raw)).toThrow(message);
  });
});

describe("escaping", () => {
  // Feature: landing-page, no markup from content.json reaches the page unescaped
  it("never lets a content value break out of its attribute", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (alt) => {
        const html = renderCapture({ writeUpUrl, capture: { ...capture, alt } });
        const attribute = /alt="([^"]*)"/.exec(html);
        expect(attribute).not.toBeNull();
        expect(attribute?.[1]).not.toMatch(/[<>"]/);
      }),
      { numRuns: 200 },
    );
  });
});
