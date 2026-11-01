import type { Step } from "@doppelganger/detector";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createChecklist, STEPS } from "./checklist.ts";
import {
  deleteReminder,
  loadReminder,
  REMINDER_KEY,
  saveReminder,
  validateReminder,
} from "./reminder.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("createChecklist", () => {
  it("completes once when the last step is ticked, in any order", () => {
    let sent = 0;
    const list = createChecklist(() => sent++);
    for (const s of [3, 1, 4] as Step[]) list.set(s, true);
    expect(sent).toBe(0);
    list.set(2, true);
    expect(sent).toBe(1);
    list.set(2, true);
    expect(sent).toBe(1);
    expect(list.done()).toEqual([1, 2, 3, 4]);
  });

  // Feature: exorcism-protocol, Property 4: Completion requires all steps
  it("sends protocol-completed exactly when the done set becomes {1, 2, 3, 4}", () => {
    const toggle = fc.record({ step: fc.constantFrom<Step>(...STEPS), done: fc.boolean() });
    fc.assert(
      fc.property(fc.array(toggle, { maxLength: 40 }), (toggles) => {
        let sent = 0;
        const list = createChecklist(() => sent++);
        const model = new Set<Step>();
        for (const t of toggles) {
          const before = model.size === 4;
          if (t.done) model.add(t.step);
          else model.delete(t.step);
          const expected = !before && model.size === 4 ? 1 : 0;
          const was = sent;
          list.set(t.step, t.done);
          expect(sent - was).toBe(expected);
          expect(list.done()).toEqual(STEPS.filter((s) => model.has(s)));
        }
      }),
      RUNS,
    );
  });
});

describe("Code_Word_Reminder", () => {
  it("saves, loads and deletes the hint under one key", () => {
    const storage = memoryStorage();
    expect(saveReminder(storage, "  the song from the team party  ")).toEqual({
      ok: true,
      value: "the song from the team party",
    });
    expect(storage.data.get(REMINDER_KEY)).toBe("the song from the team party");
    expect(loadReminder(storage)).toBe("the song from the team party");
    deleteReminder(storage);
    expect(loadReminder(storage)).toBeNull();
  });

  it("returns a stored value trimmed, so padding cannot slip past the limit", () => {
    const storage = memoryStorage();
    storage.setItem(REMINDER_KEY, `${" ".repeat(10_000)}x`);
    expect(loadReminder(storage)).toBe("x");
  });

  it("ignores a stored value that is too long", () => {
    const storage = memoryStorage();
    storage.setItem(REMINDER_KEY, "x".repeat(81));
    expect(loadReminder(storage)).toBeNull();
  });

  // Feature: exorcism-protocol, Property 5: Reminder length bound
  it("accepts a hint only when it is 1 to 80 characters after trimming", () => {
    const text = fc.oneof(
      fc.string({ maxLength: 120 }),
      fc.string({ minLength: 79, maxLength: 82 }),
      fc.constantFrom("", " ", "\t\n", "x".repeat(80), "x".repeat(81), ` ${"x".repeat(80)} `),
    );
    fc.assert(
      fc.property(text, (s) => {
        const length = s.trim().length;
        const storage = memoryStorage();
        const result = saveReminder(storage, s);
        expect(result.ok).toBe(length >= 1 && length <= 80);
        expect(validateReminder(s).ok).toBe(result.ok);
        expect(storage.data.has(REMINDER_KEY)).toBe(result.ok);
      }),
      RUNS,
    );
  });
});
