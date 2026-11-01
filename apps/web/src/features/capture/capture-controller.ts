/**
 * CaptureController (audio-capture task 3.4): source → AudioWorklet → MessageChannel →
 * Inference_Worker. The main thread wires the ports but never touches audio samples.
 */
import type { WorkerInbound, WorkerOutbound } from "@doppelganger/contracts";
import type { CaptureSource } from "./sources.ts";

export interface WorkerLike {
  postMessage(message: WorkerInbound, transfer?: Transferable[]): void;
  addEventListener(type: "message", fn: (event: MessageEvent<WorkerOutbound>) => void): void;
}

export interface ControllerDeps {
  worker: WorkerLike;
  createContext(): AudioContext;
  createWorklet(ctx: AudioContext): AudioWorkletNode;
  workletUrl: string;
  createChannel(): MessageChannel;
}

export interface CaptureController {
  readonly active: CaptureSource | null;
  start(source: CaptureSource): Promise<void>;
  stop(): Promise<void>;
  /** Called when the source ends by itself (tab closed, sharing stopped, clip finished). */
  onStopped(cb: () => void): void;
}

export function createCaptureController(deps: ControllerDeps): CaptureController {
  let ctx: AudioContext | null = null;
  let source: CaptureSource | null = null;
  let worklet: AudioWorkletNode | null = null;
  let mute: GainNode | null = null;
  const stopped: (() => void)[] = [];

  async function teardown(): Promise<void> {
    const wasActive = source !== null;
    source?.stop();
    worklet?.port.close();
    worklet?.disconnect();
    mute?.disconnect();
    const closing = ctx?.state !== "closed" ? ctx?.close() : undefined;
    source = null;
    worklet = null;
    mute = null;
    ctx = null;
    if (wasActive) deps.worker.postMessage({ type: "stop" });
    await closing;
  }

  return {
    get active() {
      return source;
    },
    async start(next) {
      await teardown();
      const context = deps.createContext();
      ctx = context;
      try {
        await context.audioWorklet.addModule(deps.workletUrl);
        const node = await next.start(context);
        const capture = deps.createWorklet(context);
        // A silent path to the destination keeps the worklet pulled by the graph.
        const silent = context.createGain();
        silent.gain.value = 0;
        node.connect(capture);
        capture.connect(silent);
        silent.connect(context.destination);
        const channel = deps.createChannel();
        capture.port.postMessage({ type: "audio-port" }, [channel.port1]);
        deps.worker.postMessage({ type: "audio-port" }, [channel.port2]);
        deps.worker.postMessage({ type: "start" });
        source = next;
        worklet = capture;
        mute = silent;
        next.onEnded(() => {
          if (source !== next) return;
          void teardown().then(() => {
            for (const cb of stopped) cb();
          });
        });
        if (context.state === "suspended") await context.resume();
      } catch (error) {
        next.stop();
        await teardown();
        throw error;
      }
    },
    stop: teardown,
    onStopped(cb) {
      stopped.push(cb);
    },
  };
}
