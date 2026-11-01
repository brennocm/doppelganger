/**
 * App bootstrap: capture, the Inference_Worker and the Main_View (haunted-ui design,
 * Architecture). Audio flows source → worklet → worker; this file sees only updates.
 */
import type { DetectorUpdate, SessionStats, WorkerOutbound } from "@doppelganger/contracts";
import { buildIncidentSummary } from "@doppelganger/detector";
import { createCaptureController } from "./features/capture/capture-controller.ts";
import workletUrl from "./features/capture/capture-processor.ts?worker&url";
import {
  captureMessage,
  isSlowDevice,
  NO_REPLAY_CLIPS,
  offersReplay,
  PRIVACY_NOTICE,
  SLOW_DEVICE,
  TAB_UNSUPPORTED,
  TEST_MODEL,
  workerMessage,
} from "./features/capture/messages.ts";
import { LIGHT_MODEL_MANIFEST } from "./features/capture/model-choice.ts";
import {
  CaptureError,
  type CaptureSource,
  micSource,
  tabAudioSupported,
  tabSource,
} from "./features/capture/sources.ts";
import { parseTestState } from "./features/haunting/test-state.ts";
import { createProtocolPanel } from "./features/protocol/protocol-panel.ts";
import { bindReminderSettings } from "./features/protocol/reminder-settings.ts";
import {
  loadClips,
  type ReplayClip,
  replayLabel,
  replaySource,
} from "./features/replay/replay-source.ts";
import { createMainView } from "./main-view.ts";

export interface AppEvents {
  /** Every update from the worker, for features such as the protocol panel. */
  onUpdate(fn: (update: DetectorUpdate) => void): void;
  completeProtocol(): void;
  /** The "Start the protocol" button (primary action in Possession). */
  readonly startProtocol: HTMLButtonElement;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

const SOURCE_NAMES = { tab: "a call tab", mic: "the microphone", replay: "a replay" } as const;

export function startApp(base: string, mode: string): AppEvents {
  const ui = {
    notice: el("privacy-notice"),
    tab: el<HTMLButtonElement>("start-tab"),
    tabUnsupported: el("tab-unsupported"),
    mic: el<HTMLButtonElement>("start-mic"),
    clips: el<HTMLUListElement>("clips"),
    noClips: el("no-clips"),
    startPanel: el("start-panel"),
    indicator: el("indicator"),
    sourceName: el("source-name"),
    sessionLabel: el("session-label"),
    stop: el<HTMLButtonElement>("stop"),
    alert: el("alert"),
    alertReplay: el<HTMLButtonElement>("alert-replay"),
    slow: el("notice-slow"),
    modelId: el("model-id"),
    testModel: el("test-model"),
  };
  ui.notice.textContent = PRIVACY_NOTICE;
  ui.slow.textContent = SLOW_DEVICE;
  ui.testModel.textContent = TEST_MODEL;

  const listeners: ((u: DetectorUpdate) => void)[] = [];
  let hopSamples = 16000;
  let ready = false;
  let model = { id: "unknown", version: "0.0.0" };
  let session: { kind: CaptureSource["kind"]; label?: "genuine" | "synthetic" } = { kind: "tab" };
  const statsWaiting: ((stats: SessionStats) => void)[] = [];

  const worker = new Worker(new URL("./features/capture/inference.worker.ts", import.meta.url), {
    type: "module",
    name: "inference",
  });
  const controller = createCaptureController({
    worker,
    createContext: () => new AudioContext({ latencyHint: "interactive" }),
    createWorklet: (ctx) =>
      new AudioWorkletNode(ctx, "capture-processor", { numberOfInputs: 1, numberOfOutputs: 1 }),
    workletUrl,
    createChannel: () => new MessageChannel(),
  });

  function setActive(source: CaptureSource | null, label = ""): void {
    ui.indicator.hidden = source === null;
    ui.startPanel.hidden = source !== null;
    ui.sourceName.textContent = source ? SOURCE_NAMES[source.kind] : "";
    ui.sessionLabel.textContent = label;
    ui.sessionLabel.hidden = label === "";
  }

  const stop = () => void controller.stop().then(() => setActive(null));
  // import.meta.env.MODE is replaced at build time, so production drops this branch entirely.
  const forced =
    import.meta.env.MODE === "production" ? null : parseTestState(location.search, mode);
  const view = createMainView({ forced, stop });
  if (forced !== null && forced.state !== "idle") {
    // Test_State_Mode shows the active layout of the forced state (one primary action).
    ui.indicator.hidden = false;
    ui.startPanel.hidden = true;
    ui.sourceName.textContent = SOURCE_NAMES.tab;
  }

  function showError(text: string, replay: boolean): void {
    ui.alert.querySelector("p")?.replaceChildren(text);
    ui.alertReplay.hidden = !replay;
    ui.alert.hidden = false;
  }

  async function begin(
    source: CaptureSource,
    label = "",
    clipLabel?: "genuine" | "synthetic",
  ): Promise<void> {
    ui.alert.hidden = true;
    if (!ready) return;
    try {
      await controller.start(source);
      session =
        clipLabel === undefined ? { kind: source.kind } : { kind: source.kind, label: clipLabel };
      setActive(source, label);
    } catch (error) {
      setActive(null);
      const code = error instanceof CaptureError ? error.code : "permission-denied";
      showError(captureMessage(code), offersReplay(code));
    }
  }

  const tabOk = tabAudioSupported(navigator as Navigator & { userAgentData?: never });
  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const message = event.data;
    switch (message.type) {
      case "ready":
        ready = true;
        hopSamples = message.model.hopSamples;
        model = { id: message.model.id, version: message.model.version };
        ui.modelId.textContent = `${message.model.id} ${message.model.version}`;
        ui.testModel.hidden = message.model.role !== "test";
        ui.tab.disabled = !tabOk;
        ui.mic.disabled = false;
        return;
      case "update":
        view.update(message.update);
        protocol.show(message.update.state);
        for (const fn of listeners) fn(message.update);
        return;
      case "levels":
        view.levels(message.bands);
        return;
      case "perf":
        ui.slow.hidden = !isSlowDevice(message.p95, hopSamples);
        return;
      case "error":
        showError(workerMessage(message.code), false);
        return;
      case "stats":
        for (const resolve of statsWaiting.splice(0)) resolve(message.stats);
        return;
    }
  });
  worker.postMessage({
    type: "init",
    manifestUrl: new URL(LIGHT_MODEL_MANIFEST, location.href).href,
  });

  const devices = navigator.mediaDevices;
  if (!tabOk) {
    ui.tab.hidden = true;
    ui.tabUnsupported.textContent = TAB_UNSUPPORTED;
    ui.tabUnsupported.hidden = false;
  }
  ui.tab.addEventListener("click", () => void begin(tabSource(devices)));
  ui.mic.addEventListener("click", () => void begin(micSource(devices)));
  ui.stop.addEventListener("click", stop);
  ui.alertReplay.addEventListener("click", () => {
    ui.alert.hidden = true;
    ui.clips.closest("section")?.scrollIntoView({ block: "nearest" });
    ui.clips.querySelector("button")?.focus();
  });
  controller.onStopped(() => setActive(null));

  const replayFolder = new URL("replay/", new URL(base, location.href)).href;
  void loadClips(new URL("clips.json", replayFolder).href, (u) => fetch(u)).then(
    (clips: ReplayClip[]) => {
      ui.noClips.textContent = NO_REPLAY_CLIPS;
      ui.noClips.hidden = clips.length > 0;
      for (const clip of clips) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-secondary";
        button.textContent = `${clip.title} (${replayLabel(clip)})`;
        button.addEventListener("click", () => {
          void begin(
            replaySource(clip, replayFolder, (u) => fetch(u)),
            replayLabel(clip),
            clip.label,
          );
        });
        const item = document.createElement("li");
        item.append(button);
        ui.clips.append(item);
      }
    },
  );

  const stats = () =>
    new Promise<SessionStats>((resolve) => {
      statsWaiting.push(resolve);
      worker.postMessage({ type: "stats" });
    });
  const completeProtocol = () => {
    // Test_State_Mode has no detector session, so the forced state moves on in the page.
    if (forced !== null) view.forceState("exorcised");
    else worker.postMessage({ type: "protocol-completed" });
  };
  const protocol = createProtocolPanel({
    onComplete: completeProtocol,
    now: () => new Date(),
    buildSummary: async (stepsDone) =>
      buildIncidentSummary({
        stats: await stats(),
        source: session.kind,
        ...(session.label === undefined ? {} : { replayLabel: session.label }),
        model,
        appVersion: __APP_VERSION__,
        stepsDone,
        endedAt: Date.now(),
        timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
      }),
  });
  bindReminderSettings(() => protocol.refreshReminder());
  view.onForcedState((state) => protocol.show(state));
  view.startProtocol.addEventListener("click", () => protocol.reveal());

  return {
    startProtocol: view.startProtocol,
    onUpdate(fn) {
      listeners.push(fn);
    },
    completeProtocol,
  };
}
