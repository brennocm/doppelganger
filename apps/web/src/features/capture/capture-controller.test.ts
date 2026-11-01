import type { WorkerInbound } from "@doppelganger/contracts";
import { describe, expect, it, vi } from "vitest";
import { createCaptureController, type WorkerLike } from "./capture-controller.ts";
import { CaptureError, type CaptureSource } from "./sources.ts";

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function setup() {
  const sent: { message: WorkerInbound; transfer: Transferable[] }[] = [];
  const worker: WorkerLike = {
    postMessage: (message, transfer = []) => sent.push({ message, transfer }),
    addEventListener: vi.fn(),
  };
  const workletPort = { postMessage: vi.fn(), close: vi.fn() };
  const worklet = { ...fakeNode(), port: workletPort } as unknown as AudioWorkletNode;
  const gain = { ...fakeNode(), gain: { value: 1 } };
  const ctx = {
    state: "running",
    destination: {},
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    createGain: () => gain,
    resume: vi.fn(),
    close: vi.fn(async function (this: { state: string }) {
      this.state = "closed";
    }),
  };
  const channel = { port1: { id: 1 }, port2: { id: 2 } } as unknown as MessageChannel;
  const controller = createCaptureController({
    worker,
    createContext: () => ctx as unknown as AudioContext,
    createWorklet: () => worklet,
    workletUrl: "/assets/capture-processor.js",
    createChannel: () => channel,
  });
  return { controller, sent, worklet, workletPort, ctx, channel, gain };
}

function fakeSource(
  start: () => Promise<AudioNode> = async () => fakeNode() as unknown as AudioNode,
) {
  let ended: (() => void) | null = null;
  const stop = vi.fn<() => void>();
  const source: CaptureSource & { end(): void; stop: typeof stop } = {
    kind: "mic",
    start,
    stop,
    onEnded: (cb) => {
      ended = cb;
    },
    end: () => ended?.(),
  };
  return source;
}

describe("createCaptureController", () => {
  it("connects source → worklet and hands each end of a channel to worklet and worker", async () => {
    const { controller, sent, workletPort, ctx, channel, gain } = setup();
    await controller.start(fakeSource());
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith("/assets/capture-processor.js");
    expect(workletPort.postMessage).toHaveBeenCalledWith({ type: "audio-port" }, [channel.port1]);
    expect(sent).toEqual([
      { message: { type: "audio-port" }, transfer: [channel.port2] },
      { message: { type: "start" }, transfer: [] },
    ]);
    expect(gain.gain.value).toBe(0);
    // Only ports and control messages go to the worker from the main thread.
    for (const { transfer } of sent) for (const t of transfer) expect(t).toBe(channel.port2);
  });

  it("stops the source, closes the context and tells the worker on stop()", async () => {
    const { controller, sent, ctx } = setup();
    const source = fakeSource();
    await controller.start(source);
    await controller.stop();
    expect(source.stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    expect(sent.at(-1)?.message).toEqual({ type: "stop" });
    expect(controller.active).toBeNull();
  });

  it("returns to idle when the source ends by itself (Requirement 1.4)", async () => {
    const { controller, sent } = setup();
    const source = fakeSource();
    const stopped = vi.fn();
    controller.onStopped(stopped);
    await controller.start(source);
    source.end();
    await vi.waitFor(() => expect(stopped).toHaveBeenCalled());
    expect(sent.at(-1)?.message).toEqual({ type: "stop" });
  });

  it("cleans up and rethrows when the source fails", async () => {
    const { controller, sent, ctx } = setup();
    const source = fakeSource(() => Promise.reject(new CaptureError("permission-denied")));
    await expect(controller.start(source)).rejects.toMatchObject({ code: "permission-denied" });
    expect(ctx.close).toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(controller.active).toBeNull();
  });
});
