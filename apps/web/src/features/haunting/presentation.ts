/** What the Main_View shows for a state and score (haunted-ui Requirements 1 and 6.2). */
import type { HauntingState } from "@doppelganger/contracts";
import { displayScore, STATE_COPY } from "./copy.ts";

/** One Phosphor glyph per state, so the state never rests on color alone. */
export const STATE_ICONS: Readonly<Record<HauntingState, string>> = {
  idle: "microphone-slash",
  listening: "ear",
  mask: "user-sound",
  unease: "warning",
  possession: "skull",
  exorcised: "shield-check",
};

export type PrimaryAction = "listen" | "stop" | "protocol";

export interface Presentation {
  state: HauntingState;
  headline: string;
  line: string;
  iconLabel: string;
  icon: string;
  /** Integer 0–100 as text, or "–" before the first score. */
  score: string;
  primaryAction: PrimaryAction;
}

export function primaryAction(state: HauntingState): PrimaryAction {
  if (state === "idle") return "listen";
  if (state === "possession") return "protocol";
  return "stop";
}

export function present(state: HauntingState, smoothed: number | null): Presentation {
  const copy = STATE_COPY[state];
  return {
    state,
    headline: copy.headline,
    line: copy.line,
    iconLabel: copy.icon,
    icon: STATE_ICONS[state],
    score: smoothed === null ? "–" : String(displayScore(smoothed)),
    primaryAction: primaryAction(state),
  };
}
