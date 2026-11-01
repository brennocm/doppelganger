/**
 * State → DOM (haunted-ui Requirements 1, 3 and 6.2). Sets data-state, the text, the
 * primary action and the live regions; CSS in states.css does the rest.
 */
import type { HauntingState } from "@doppelganger/contracts";
import { type Presentation, present } from "./presentation.ts";

/** Possession entrance length; the sequence runs once per entry. */
export const POSSESSION_SEQUENCE_MS = 1500;
/** When the headline is announced within the sequence. */
export const HEADLINE_AT_MS = 700;

export interface ViewElements {
  root: HTMLElement;
  headline: HTMLElement;
  line: HTMLElement;
  iconLabel: HTMLElement;
  score: HTMLOutputElement;
  polite: HTMLElement;
  assertive: HTMLElement;
  startProtocol: HTMLButtonElement;
}

export interface HauntingView {
  show(state: HauntingState, smoothed: number | null): void;
  readonly state: HauntingState;
}

export interface ViewOptions {
  /** Plays the optional sound cue on Possession entry. */
  onPossession?: () => void;
  /** Test_State_Mode: render the final presentation at once. */
  instant?: boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

export function createHauntingView(el: ViewElements, opts: ViewOptions = {}): HauntingView {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  let current: HauntingState = "idle";
  let sequence = 0;

  function text(p: Presentation): void {
    el.headline.textContent = p.headline;
    el.line.textContent = p.line;
    el.iconLabel.textContent = p.iconLabel;
    el.startProtocol.hidden = p.primaryAction !== "protocol";
  }

  return {
    get state() {
      return current;
    },
    show(state, smoothed) {
      const p = present(state, smoothed);
      el.score.value = p.score;
      if (state === current) return;
      const entering = state === "possession";
      current = state;
      el.root.dataset["state"] = state;
      if (!entering || opts.instant) {
        delete el.root.dataset["sequence"];
        text(p);
        if (entering) el.assertive.textContent = `${p.headline}. ${p.line}`;
        else el.polite.textContent = `${p.headline}. ${p.line}`;
        if (entering) opts.onPossession?.();
        return;
      }
      // Possession: tint and tear start now; the headline lands at 700 ms (states.css).
      const id = ++sequence;
      el.root.dataset["sequence"] = "possession";
      text(p);
      opts.onPossession?.();
      setTimer(() => {
        if (id === sequence && current === "possession")
          el.assertive.textContent = `${p.headline}. ${p.line}`;
      }, HEADLINE_AT_MS);
      setTimer(() => {
        if (id === sequence) delete el.root.dataset["sequence"];
      }, POSSESSION_SEQUENCE_MS);
    },
  };
}

/** One short, low tone (Requirement 3.5). Off unless the user ticks the box this visit. */
export function playLowTone(createContext: () => AudioContext = () => new AudioContext()): void {
  const ctx = createContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 220;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.26);
  osc.addEventListener("ended", () => void ctx.close(), { once: true });
}
