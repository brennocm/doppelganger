/** Protocol checklist logic (exorcism-protocol Requirement 1.2, 1.3). */
import type { Step } from "@doppelganger/detector";

export const STEPS: readonly Step[] = [1, 2, 3, 4];

export interface Checklist {
  /** Mark a step done or not done, in any order. */
  set(step: Step, done: boolean): void;
  done(): Step[];
  reset(): void;
}

/** `onComplete` runs each time the set of done steps becomes {1, 2, 3, 4}. */
export function createChecklist(onComplete: () => void): Checklist {
  const done = new Set<Step>();
  return {
    set(step, value) {
      if (!STEPS.includes(step)) return;
      const wasComplete = done.size === STEPS.length;
      if (value) done.add(step);
      else done.delete(step);
      if (!wasComplete && done.size === STEPS.length) onComplete();
    },
    done() {
      return STEPS.filter((s) => done.has(s));
    },
    reset() {
      done.clear();
    },
  };
}
