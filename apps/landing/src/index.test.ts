import { describe, expect, it, vi } from "vitest";
import { copyCommand, PACKAGE_NAME } from "./index.ts";

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
