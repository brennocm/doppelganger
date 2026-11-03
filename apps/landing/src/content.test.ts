import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BASE_CSP,
  capturePending,
  cspFor,
  LANDING_CSP,
  PENDING,
  parseContent,
  renderCapture,
  renderVideo,
  renderWriteUp,
  videoPending,
} from "./content.ts";

const pending = {
  videoId: PENDING,
  videoPoster: PENDING,
  writeUpUrl: PENDING,
  capture: { video: PENDING, poster: PENDING, alt: "A capture." },
};
const real = {
  videoId: "aaaaaaaaaaa",
  videoPoster: "media/video-poster.svg",
  writeUpUrl: "https://github.com/brennocm/doppelganger/blob/main/docs/KIRO.md",
  capture: { video: "media/capture.mp4", poster: "media/capture-poster.svg", alt: "A capture." },
};

describe("pending content", () => {
  const content = parseContent(pending);

  it("is neutral: no marker, no embed, no write-up, no capture", () => {
    const html = [renderVideo(content), renderWriteUp(content), renderCapture(content)].join("");
    expect(html).not.toContain(PENDING);
    expect(html).not.toContain("youtube");
    expect(renderVideo(content)).toBe("<p>The 3-minute video is not published yet.</p>");
    expect(renderWriteUp(content)).toBe("");
    expect(renderCapture(content)).toBe("");
    expect(videoPending(content)).toBe(true);
    expect(capturePending(content)).toBe(true);
  });

  it("keeps the base policy: no frame-src until a video is embedded", () => {
    expect(cspFor(content)).toBe(BASE_CSP);
    expect(cspFor(content)).not.toContain("frame-src");
  });
});

describe("real content", () => {
  const content = parseContent(real);

  it("adds the facade, the write-up link and the capture", () => {
    const video = renderVideo(content);
    expect(video).toContain('data-embed="https://www.youtube-nocookie.com/embed/aaaaaaaaaaa"');
    expect(video).toContain('<img src="./media/video-poster.svg"');
    expect(video).not.toContain("<iframe"); // inserted only after a click
    expect(renderWriteUp(content)).toContain("docs/KIRO.md");
    expect(renderCapture(content)).toContain('data-video="./media/capture.mp4"');
    expect(renderCapture(content)).toContain('alt="A capture."');
  });

  it("allows frame-src for the privacy-enhanced domain and nothing else", () => {
    expect(cspFor(content)).toBe(LANDING_CSP);
    expect(LANDING_CSP).toBe(`${BASE_CSP}; frame-src https://www.youtube-nocookie.com`);
  });

  it("uses the page's base path for media", () => {
    expect(renderCapture(content, "/doppelganger/")).toContain("/doppelganger/media/capture.mp4");
  });
});

describe("validation", () => {
  it.each([
    [{ ...real, videoId: "short" }, "11-character"],
    [{ ...real, videoId: "aaaaaaaaaa>" }, "11-character"],
    [{ ...real, writeUpUrl: "https://example.com/x" }, "must start with"],
    [{ ...real, writeUpUrl: "javascript:alert(1)" }, "must start with"],
    [{ ...real, videoPoster: "../secret.png" }, "media/<name>"],
    [{ ...real, capture: { ...real.capture, video: "media/x.exe" } }, "media/<name>"],
    [{ ...real, capture: { ...real.capture, alt: "" } }, "capture.alt"],
    [{ ...real, videoPoster: undefined }, "videoPoster"],
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
        const html = renderCapture({ ...parseContent(real), capture: { ...real.capture, alt } });
        const attribute = /alt="([^"]*)"/.exec(html);
        expect(attribute).not.toBeNull();
        expect(attribute?.[1]).not.toMatch(/[<>"]/);
      }),
      { numRuns: 200 },
    );
  });
});
