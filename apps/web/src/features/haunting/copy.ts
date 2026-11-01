/** State copy from the design-system steering ("Copy voice"). */
import type { HauntingState } from "@doppelganger/contracts";

export interface StateCopy {
  headline: string;
  line: string;
  /** Text equivalent of the state icon, so color never carries meaning alone. */
  icon: string;
}

export const STATE_COPY: Readonly<Record<HauntingState, StateCopy>> = {
  idle: { headline: "Not listening", line: "Choose a call tab to start.", icon: "Idle" },
  listening: {
    headline: "Waiting for a voice",
    line: "Nothing to analyze yet.",
    icon: "Listening",
  },
  mask: { headline: "Sounds human", line: "Dissonance is low.", icon: "Human voice" },
  unease: {
    headline: "Something doesn't add up",
    line: "This voice shows some synthetic traits. Keep listening.",
    icon: "Warning",
  },
  possession: {
    headline: "Doppelgänger detected",
    line: "Critical dissonance. Do not approve anything on this call.",
    icon: "Alert",
  },
  exorcised: {
    headline: "Protocol completed",
    line: "Stay alert for the rest of the call.",
    icon: "Protocol completed",
  },
};

/** Smoothed score in [0, 1] as the integer shown to the user (haunted-ui Property 2). */
export function displayScore(smoothed: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(smoothed) ? smoothed : 0));
  return Math.round(clamped * 100);
}
