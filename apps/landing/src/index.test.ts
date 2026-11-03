import { describe, expect, it, vi } from "vitest";
import { activateFacade, copyCommand, PACKAGE_NAME, playCapture } from "./index.ts";

/** The few Document members copyCommand uses, without a DOM library. */
function fakeDoc() {
  const status = { textContent: "" };
  const code = { textContent: "scripts/install.sh --static" };
  const selected: unknown[] = [];
  const range = { selectNodeContents: vi.fn() };
  const doc = {
    getElementById: (id: string) => ({ cmd: code, "copy-status": status })[id] ?? null,
    createRange: () => range,
    getSelection: () => ({ removeAllRanges: vi.fn(), addRange: (r: unknown) => selected.push(r) }),
  };
  const button = { dataset: { copy: "cmd" } };
  return {
    doc: doc as unknown as Document,
    button: button as unknown as HTMLElement,
    status,
    selected,
    range,
  };
}

describe("@doppelganger/landing", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@doppelganger/landing");
  });

  it("copies the command and says so", async () => {
    const { doc, button, status } = fakeDoc();
    const writeText = vi.fn(async () => {});
    const now = (run: () => void) => run();
    expect(await copyCommand(button, doc, { writeText }, now)).toBe("Copied to the clipboard.");
    expect(writeText).toHaveBeenCalledWith("scripts/install.sh --static");
    expect(status.textContent).toBe("Copied to the clipboard.");
  });

  it("selects the command when the clipboard is unavailable or refused", async () => {
    const { doc, button, selected, range } = fakeDoc();
    expect(await copyCommand(button, doc, undefined, (r) => r())).toBe(
      "Selected. Press Ctrl+C to copy.",
    );
    const refused = { writeText: () => Promise.reject(new Error("denied")) };
    expect(await copyCommand(button, doc, refused, (r) => r())).toBe(
      "Selected. Press Ctrl+C to copy.",
    );
    expect(selected).toEqual([range, range]);
  });

  it("names the command and re-announces a repeated message", async () => {
    const { doc, status } = fakeDoc();
    const named = {
      dataset: { copy: "cmd", name: "Pro engine command" },
    } as unknown as HTMLElement;
    const pending: (() => void)[] = [];
    const later = (run: () => void) => {
      pending.push(run);
    };
    const clip = { writeText: async () => {} };
    expect(await copyCommand(named, doc, clip, later)).toBe("Pro engine command copied.");
    expect(status.textContent).toBe("");
    pending.shift()?.();
    expect(status.textContent).toBe("Pro engine command copied.");
    await copyCommand(named, doc, clip, later);
    expect(status.textContent).toBe("");
  });

  it("does nothing for a button without a target", async () => {
    const { doc } = fakeDoc();
    const orphan = { dataset: { copy: "missing" } } as unknown as HTMLElement;
    expect(await copyCommand(orphan, doc, undefined)).toBe("");
  });
});

describe("video facade", () => {
  /** The few members activateFacade uses: a button to replace and a document to create the frame. */
  function facade(embed: string | undefined) {
    const replaced: unknown[] = [];
    const frame: Record<string, unknown> = { setAttribute: vi.fn() };
    const button = {
      dataset: embed === undefined ? {} : { embed },
      replaceWith: (f: unknown) => replaced.push(f),
    };
    const doc = { createElement: () => frame };
    return {
      button: button as unknown as HTMLElement,
      doc: doc as unknown as Document,
      frame,
      replaced,
    };
  }

  it("turns the button into a privacy-enhanced player", () => {
    const { button, doc, frame, replaced } = facade(
      "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa",
    );
    expect(activateFacade(button, doc)).toBe(true);
    expect(replaced).toEqual([frame]);
    expect(frame["src"]).toBe("https://www.youtube-nocookie.com/embed/aaaaaaaaaaa");
    expect(frame["referrerPolicy"]).toBe("no-referrer");
    expect(frame["allow"]).toBe("");
  });

  it.each([
    undefined,
    "",
    "https://evil.example/embed/aaaaaaaaaaa",
    "http://www.youtube-nocookie.com/embed/aaaaaaaaaaa",
    "https://www.youtube.com/embed/aaaaaaaaaaa",
    "https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?autoplay=1",
    "https://www.youtube-nocookie.com/embed/short",
    "https://www.youtube-nocookie.com.evil.example/embed/aaaaaaaaaaa",
    "javascript:alert(1)",
  ])("refuses %s", (address) => {
    const { button, doc, replaced } = facade(address);
    expect(activateFacade(button, doc)).toBe(false);
    expect(replaced).toEqual([]);
  });
});

describe("capture slot", () => {
  function figure(source: string | undefined, hasVideo = false) {
    const appended: Record<string, unknown>[] = [];
    const video: Record<string, unknown> = { setAttribute: vi.fn() };
    const node = {
      dataset: source === undefined ? {} : { video: source },
      querySelector: (selector: string) =>
        selector === "video"
          ? hasVideo
            ? {}
            : null
          : { getAttribute: () => "./media/poster.svg" },
      append: (v: Record<string, unknown>) => appended.push(v),
      classList: { add: vi.fn() },
    };
    const doc = { createElement: () => video };
    return {
      node: node as unknown as HTMLElement,
      doc: doc as unknown as Document,
      video,
      appended,
    };
  }

  it("adds one muted, looping, lazy video with the poster", () => {
    const { node, doc, video, appended } = figure("./media/capture.mp4");
    expect(playCapture(node, doc)).toBe(true);
    expect(appended).toEqual([video]);
    expect(video["muted"]).toBe(true);
    expect(video["loop"]).toBe(true);
    expect(video["preload"]).toBe("none");
    expect(video["src"]).toBe("./media/capture.mp4");
    expect(video["poster"]).toBe("./media/poster.svg");
  });

  it("does nothing without a source or when a video is already there", () => {
    expect(playCapture(figure(undefined).node, figure(undefined).doc)).toBe(false);
    expect(playCapture(figure("").node, figure("").doc)).toBe(false);
    const { node, doc, appended } = figure("./media/capture.mp4", true);
    expect(playCapture(node, doc)).toBe(false);
    expect(appended).toEqual([]);
  });
});
