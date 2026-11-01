import { describe, expect, it } from "vitest";
import {
  createHauntingView,
  HEADLINE_AT_MS,
  POSSESSION_SEQUENCE_MS,
  type ViewElements,
} from "./haunting-view.ts";

/** Minimal stand-ins for the elements the view writes to (no DOM in unit tests). */
function elements(): ViewElements {
  const node = () => ({
    textContent: "",
    dataset: {} as Record<string, string>,
    hidden: true,
    value: "",
  });
  return {
    root: node(),
    headline: node(),
    line: node(),
    iconLabel: node(),
    score: node(),
    polite: node(),
    assertive: node(),
    startProtocol: node(),
  } as unknown as ViewElements;
}

function timers() {
  const queue: { at: number; fn: () => void }[] = [];
  return {
    set: (fn: () => void, ms: number) => queue.push({ at: ms, fn }),
    runUntil(ms: number) {
      for (const t of queue.filter((q) => q.at <= ms)) t.fn();
    },
  };
}

describe("createHauntingView", () => {
  it("writes headline, line, score and a polite announcement for ordinary states", () => {
    const el = elements();
    const t = timers();
    const view = createHauntingView(el, { setTimer: t.set });
    view.show("mask", 0.123);
    t.runUntil(0);
    expect(el.root.dataset["state"]).toBe("mask");
    expect(el.headline.textContent).toBe("Sounds human");
    expect(el.score.value).toBe("12");
    expect(el.polite.textContent).toBe("Sounds human. Dissonance is low.");
    expect(el.assertive.textContent).toBe("");
    expect(el.startProtocol.hidden).toBe(true);
  });

  it("runs the Possession sequence once and announces assertively at 700 ms", () => {
    const el = elements();
    const t = timers();
    let tones = 0;
    const view = createHauntingView(el, { setTimer: t.set, onPossession: () => tones++ });
    view.show("unease", 0.6);
    view.show("possession", 0.8);
    view.show("possession", 0.85); // same state: only the score updates
    expect(el.root.dataset["sequence"]).toBe("possession");
    expect(el.startProtocol.hidden).toBe(false);
    expect(el.assertive.textContent).toBe("");
    t.runUntil(HEADLINE_AT_MS);
    expect(el.assertive.textContent).toBe(
      "Doppelgänger detected. Critical dissonance. Do not approve anything on this call.",
    );
    t.runUntil(POSSESSION_SEQUENCE_MS);
    expect(el.root.dataset["sequence"]).toBeUndefined();
    expect(el.score.value).toBe("85");
    expect(tones).toBe(1);
  });

  it("renders Possession at once in Test_State_Mode", () => {
    const el = elements();
    const t = timers();
    createHauntingView(el, { instant: true, setTimer: t.set }).show("possession", 0.9);
    t.runUntil(0);
    expect(el.root.dataset["sequence"]).toBeUndefined();
    expect(el.assertive.textContent).toContain("Doppelgänger detected");
  });
});
