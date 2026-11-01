/**
 * Protocol panel (exorcism-protocol Requirements 1, 3.3 and 4): an in-page checklist with
 * native checkboxes, collapsed in Exorcised, plus Copy and Download of the summary.
 */
import type { HauntingState, IncidentSummary } from "@doppelganger/contracts";
import type { Step } from "@doppelganger/detector";
import { createChecklist } from "./checklist.ts";
import { loadReminder } from "./reminder.ts";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

export interface PanelDeps {
  onComplete(): void;
  /** Builds the summary with the steps marked done so far. */
  buildSummary(stepsDone: Step[]): Promise<{ text: string; json: IncidentSummary }>;
  now(): Date;
}

export interface ProtocolPanel {
  show(state: HauntingState): void;
  /** Brings the panel into view and focuses the first open step. */
  reveal(): void;
  refreshReminder(): void;
}

export function createProtocolPanel(deps: PanelDeps): ProtocolPanel {
  const panel = el("protocol-slot");
  const steps = el("protocol-steps");
  const toggle = el<HTMLButtonElement>("protocol-toggle");
  const doneLine = el("protocol-done-line");
  const reminder = el("reminder-in-step");
  const status = el("summary-status");
  const fallback = el("summary-fallback");
  const fallbackText = el<HTMLTextAreaElement>("summary-text");
  const boxes = [...panel.querySelectorAll<HTMLInputElement>("input[data-step]")];
  let state: HauntingState = "idle";

  const checklist = createChecklist(() => {
    doneLine.textContent = `Protocol completed at ${deps.now().toTimeString().slice(0, 5)}`;
    deps.onComplete();
  });
  for (const box of boxes) {
    box.addEventListener("change", () =>
      checklist.set(Number(box.dataset["step"]) as Step, box.checked),
    );
  }

  function collapse(collapsed: boolean): void {
    steps.hidden = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "Show the steps" : "Hide the steps";
  }
  toggle.addEventListener("click", () => collapse(!steps.hidden));

  el<HTMLButtonElement>("copy-summary").addEventListener("click", async () => {
    const { text } = await deps.buildSummary(checklist.done());
    try {
      await navigator.clipboard.writeText(text);
      fallback.hidden = true;
      status.textContent = "Summary copied.";
    } catch {
      // Clipboard unavailable or denied: show the text, selected, to copy by hand.
      fallbackText.value = text;
      fallback.hidden = false;
      fallbackText.focus();
      fallbackText.select();
      status.textContent = "Copy was blocked, so the summary is shown below.";
    }
  });

  el<HTMLButtonElement>("download-summary").addEventListener("click", async () => {
    const { json } = await deps.buildSummary(checklist.done());
    const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `doppelganger-incident-${json.endedAt.slice(0, 19).replaceAll(":", "")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke after the click has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = "Summary downloaded.";
  });

  function refreshReminder(): void {
    const hint = loadReminder(localStorage);
    reminder.textContent = hint === null ? "" : `Your reminder: ${hint}`;
    reminder.hidden = hint === null;
  }
  refreshReminder();

  return {
    refreshReminder,
    show(next) {
      const before = state;
      state = next;
      if (next === "possession") {
        panel.hidden = false;
        toggle.hidden = true;
        doneLine.hidden = true;
        collapse(false);
      } else if (next === "exorcised") {
        panel.hidden = false;
        toggle.hidden = false;
        doneLine.hidden = doneLine.textContent === "";
        if (before !== "exorcised") collapse(true);
      } else if (next === "idle") {
        // The session ended: the protocol resets for the next one.
        panel.hidden = true;
        checklist.reset();
        for (const box of boxes) box.checked = false;
        doneLine.textContent = "";
        status.textContent = "";
        fallback.hidden = true;
      }
      // Listening, Mask and Unease keep whatever was shown: the protocol stays reachable
      // until the session ends (Requirement 1.4).
    },
    reveal() {
      if (panel.hidden) return;
      if (steps.hidden) collapse(false);
      panel.scrollIntoView({ block: "start" });
      (boxes.find((b) => !b.checked) ?? boxes[0])?.focus();
    },
  };
}
