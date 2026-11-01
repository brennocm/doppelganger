/**
 * App bootstrap: capture, the Inference_Worker and the views (haunted-ui design,
 * Architecture). Audio flows source → worklet → worker; this file sees only updates.
 */
import type { DetectorUpdate, WorkerOutbound } from "@doppelganger/contracts";
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
import { displayScore, STATE_COPY } from "./features/haunting/copy.ts";
import {
  loadClips,
  type ReplayClip,
  replayLabel,
  replaySource,
} from "./features/replay/replay-source.ts";

export interface AppEvents {
  /** Every update from the worker, for the haunting views. */
  onUpdate(fn: (update: DetectorUpdate) => void): void;
  completeProtocol(): void;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

const SOURCE_NAMES = { tab: "a call tab", mic: "the microphone", replay: "a replay" } as const;

export function startApp(base: string): AppEvents {
  const root = el<HTMLElement>("app");
  const ui = {
    headline: el("state-headline"),
    line: el("state-line"),
    icon: el("state-icon"),
    score: el<HTMLOutputElement>("score"),
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

  function render(update: DetectorUpdate): void {
    const copy = STATE_COPY[update.state];
    root.dataset["state"] = update.state;
    ui.headline.textContent = copy.headline;
    ui.line.textContent = copy.line;
    ui.icon.textContent = copy.icon;
    ui.score.value = update.smoothed === null ? "–" : String(displayScore(update.smoothed));
  }

  function showError(text: string, replay: boolean): void {
    ui.alert.querySelector("p")?.replaceChildren(text);
    ui.alertReplay.hidden = !replay;
    ui.alert.hidden = false;
  }

  function setActive(source: CaptureSource | null, label = ""): void {
    ui.indicator.hidden = source === null;
    ui.startPanel.hidden = source !== null;
    ui.sourceName.textContent = source ? SOURCE_NAMES[source.kind] : "";
    ui.sessionLabel.textContent = label;
    ui.sessionLabel.hidden = label === "";
  }

  async function begin(source: CaptureSource, label = ""): Promise<void> {
    ui.alert.hidden = true;
    if (!ready) return;
    try {
      await controller.start(source);
      setActive(source, label);
    } catch (error) {
      setActive(null);
      const code = error instanceof CaptureError ? error.code : "permission-denied";
      showError(captureMessage(code), offersReplay(code));
    }
  }

  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const message = event.data;
    switch (message.type) {
      case "ready":
        ready = true;
        hopSamples = message.model.hopSamples;
        ui.modelId.textContent = `${message.model.id} ${message.model.version}`;
        ui.testModel.hidden = message.model.role !== "test";
        ui.tab.disabled = !tabAudioSupported(navigator as Navigator & { userAgentData?: never });
        ui.mic.disabled = false;
        return;
      case "update":
        render(message.update);
        for (const fn of listeners) fn(message.update);
        return;
      case "perf":
        ui.slow.hidden = !isSlowDevice(message.p95, hopSamples);
        return;
      case "error":
        showError(workerMessage(message.code), false);
        return;
      case "stats":
        return;
    }
  });
  worker.postMessage({
    type: "init",
    manifestUrl: new URL(LIGHT_MODEL_MANIFEST, location.href).href,
  });

  const devices = navigator.mediaDevices;
  if (!tabAudioSupported(navigator as Navigator & { userAgentData?: never })) {
    ui.tab.hidden = true;
    ui.tabUnsupported.textContent = TAB_UNSUPPORTED;
    ui.tabUnsupported.hidden = false;
  }
  ui.tab.addEventListener("click", () => void begin(tabSource(devices)));
  ui.mic.addEventListener("click", () => void begin(micSource(devices)));
  ui.stop.addEventListener("click", () => {
    void controller.stop().then(() => setActive(null));
  });
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
        button.textContent = `${clip.title} (${replayLabel(clip)})`;
        button.addEventListener(
          "click",
          () =>
            void begin(
              replaySource(clip, replayFolder, (u) => fetch(u)),
              replayLabel(clip),
            ),
        );
        const item = document.createElement("li");
        item.append(button);
        ui.clips.append(item);
      }
    },
  );

  return {
    onUpdate(fn) {
      listeners.push(fn);
    },
    completeProtocol() {
      worker.postMessage({ type: "protocol-completed" });
    },
  };
}
