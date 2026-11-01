/**
 * Capture_Sources (audio-capture Requirements 1 and 2): a call tab, the microphone, or a
 * bundled Replay_Clip. Browser APIs are injected so the logic is testable without one.
 */

export type SourceKind = "tab" | "mic" | "replay";

export interface CaptureSource {
  readonly kind: SourceKind;
  /** Connects the audio to a node in `ctx`; rejects with a CaptureError. */
  start(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  onEnded(cb: () => void): void;
}

export type CaptureErrorCode =
  | "no-tab-audio"
  | "permission-denied"
  | "unsupported"
  | "replay-failed";

export class CaptureError extends Error {
  override readonly name = "CaptureError";
  constructor(readonly code: CaptureErrorCode) {
    super(code);
  }
}

type MediaDevicesLike = Pick<MediaDevices, "getUserMedia"> &
  Partial<Pick<MediaDevices, "getDisplayMedia">>;

interface NavigatorLike {
  mediaDevices?: MediaDevicesLike;
  userAgentData?: { brands?: readonly { brand: string }[] };
}

/**
 * Tab audio works in Chromium-based desktop browsers. Firefox and Safari implement
 * getDisplayMedia without tab audio, so feature detection alone is not enough.
 */
export function tabAudioSupported(nav: NavigatorLike): boolean {
  const chromium = nav.userAgentData?.brands?.some((b) => b.brand === "Chromium") ?? false;
  return chromium && typeof nav.mediaDevices?.getDisplayMedia === "function";
}

function asCaptureError(error: unknown): CaptureError {
  if (error instanceof CaptureError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return new CaptureError("permission-denied");
  if (name === "NotSupportedError" || name === "TypeError") return new CaptureError("unsupported");
  return new CaptureError("permission-denied");
}

function streamSource(kind: "tab" | "mic", request: () => Promise<MediaStream>): CaptureSource {
  let stream: MediaStream | null = null;
  const ended: (() => void)[] = [];
  return {
    kind,
    async start(ctx) {
      try {
        stream = await request();
      } catch (error) {
        throw asCaptureError(error);
      }
      // Requirement 1.3: Chromium needs video for tab audio; drop it at once.
      for (const track of stream.getVideoTracks()) {
        track.stop();
        stream.removeTrack(track);
      }
      const audio = stream.getAudioTracks();
      if (audio.length === 0) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
        throw new CaptureError(kind === "tab" ? "no-tab-audio" : "permission-denied");
      }
      // Requirement 1.4: the user stops sharing or closes the tab.
      for (const track of audio)
        track.addEventListener(
          "ended",
          () => {
            for (const cb of ended) cb();
          },
          { once: true },
        );
      return ctx.createMediaStreamSource(stream);
    },
    stop() {
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
    },
    onEnded(cb) {
      ended.push(cb);
    },
  };
}

export function tabSource(devices: MediaDevicesLike): CaptureSource {
  return streamSource("tab", () => {
    if (!devices.getDisplayMedia) return Promise.reject(new CaptureError("unsupported"));
    // Chromium-specific options are not in TS's DOM lib yet.
    const options = {
      audio: { suppressLocalAudioPlayback: false },
      video: true,
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      systemAudio: "exclude",
      monitorTypeSurfaces: "exclude",
    } as DisplayMediaStreamOptions;
    return devices.getDisplayMedia(options);
  });
}

/** Requirement 2.1: no echo cancellation, noise suppression or auto gain. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
};

export function micSource(devices: MediaDevicesLike): CaptureSource {
  return streamSource("mic", () => devices.getUserMedia(MIC_CONSTRAINTS));
}
