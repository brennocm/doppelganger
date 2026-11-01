/**
 * `WS /v1/stream` messages between the web app and the local engine (local-runtime 3.1,
 * P29). Text frames carry these JSON messages; audio goes only as binary PCM16 LE frames.
 */

export interface StreamHello {
  type: "hello";
  protocol: 1;
  token: string;
  sampleRate: 16000;
}

export interface StreamReady {
  type: "ready";
  modelId: string;
  windowSamples: number;
  hopSamples: number;
}

export interface StreamScore {
  type: "score";
  windowIndex: number;
  /** Null for an unvoiced window or a failed score. */
  raw: number | null;
  smoothed: number | null;
  modelId: string;
}

export interface StreamError {
  type: "error";
  code: "bad-hello" | "bad-frame" | "rate-limited";
}

export type StreamServerMessage = StreamReady | StreamScore | StreamError;
