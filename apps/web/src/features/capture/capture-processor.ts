/**
 * AudioWorkletProcessor "capture-processor" (audio-capture Requirement 3). Downmixes and
 * resamples every render quantum and posts 1,600-sample chunks, as transferables, on the
 * MessagePort it receives from the main thread. That port leads straight to the
 * Inference_Worker, so audio never passes through the main thread.
 */
import type { AudioChunkMessage } from "@doppelganger/contracts";
import { createCaptureBatcher } from "./capture-batcher.ts";

// AudioWorkletGlobalScope globals; TypeScript's DOM lib does not describe this scope.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor & {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  },
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly batcher = createCaptureBatcher(sampleRate);
  private out: MessagePort | null = null;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type?: unknown }>) => {
      if (event.data?.type === "audio-port" && event.ports[0]) this.out = event.ports[0];
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (channels === undefined || channels.length === 0) return true;
    for (const samples of this.batcher.push(channels)) {
      const message: AudioChunkMessage = { type: "chunk", samples };
      // Without a port yet, the chunk is dropped rather than kept.
      this.out?.postMessage(message, [samples.buffer]);
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
