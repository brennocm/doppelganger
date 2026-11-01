import { describe, expect, it, vi } from "vitest";
import {
  CaptureError,
  MIC_CONSTRAINTS,
  micSource,
  tabAudioSupported,
  tabSource,
} from "./sources.ts";

class FakeTrack extends EventTarget {
  stopped = false;
  constructor(readonly kind: "audio" | "video") {
    super();
  }
  stop() {
    this.stopped = true;
  }
}

function fakeStream(kinds: ("audio" | "video")[]) {
  let tracks = kinds.map((k) => new FakeTrack(k));
  const all = [...tracks];
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    removeTrack: (t: FakeTrack) => {
      tracks = tracks.filter((x) => x !== t);
    },
  };
  return { stream: stream as unknown as MediaStream, all };
}

const node = {} as MediaStreamAudioSourceNode;
const ctx = { createMediaStreamSource: vi.fn(() => node) } as unknown as AudioContext;

describe("tabAudioSupported (Requirement 1.5)", () => {
  const getDisplayMedia = async () => fakeStream([]).stream;
  it("needs a Chromium browser with getDisplayMedia", () => {
    const devices = { getUserMedia: getDisplayMedia, getDisplayMedia };
    expect(
      tabAudioSupported({
        mediaDevices: devices,
        userAgentData: { brands: [{ brand: "Chromium" }] },
      }),
    ).toBe(true);
    expect(tabAudioSupported({ mediaDevices: devices })).toBe(false);
    expect(tabAudioSupported({ userAgentData: { brands: [{ brand: "Chromium" }] } })).toBe(false);
  });
});

describe("tabSource (Requirement 1)", () => {
  it("asks for tab audio with video, then stops the video track at once", async () => {
    const { stream, all } = fakeStream(["video", "audio"]);
    const getDisplayMedia = vi.fn(async () => stream);
    const source = tabSource({ getUserMedia: vi.fn(), getDisplayMedia });
    expect(await source.start(ctx)).toBe(node);
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: true, audio: expect.any(Object) }),
    );
    expect(all[0]?.stopped).toBe(true);
    expect(stream.getVideoTracks()).toEqual([]);
    expect(all[1]?.stopped).toBe(false);
  });

  it("stops everything and explains when the tab was shared without audio", async () => {
    const { stream, all } = fakeStream(["video"]);
    const source = tabSource({ getUserMedia: vi.fn(), getDisplayMedia: async () => stream });
    await expect(source.start(ctx)).rejects.toEqual(new CaptureError("no-tab-audio"));
    expect(all.every((t) => t.stopped)).toBe(true);
  });

  it("maps a denied permission to permission-denied", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const source = tabSource({
      getUserMedia: vi.fn(),
      getDisplayMedia: () => Promise.reject(denied),
    });
    await expect(source.start(ctx)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("reports the end of sharing and stops its tracks on stop()", async () => {
    const { stream, all } = fakeStream(["audio"]);
    const source = tabSource({ getUserMedia: vi.fn(), getDisplayMedia: async () => stream });
    const ended = vi.fn();
    source.onEnded(ended);
    await source.start(ctx);
    all[0]?.dispatchEvent(new Event("ended"));
    expect(ended).toHaveBeenCalledOnce();
    source.stop();
    expect(all[0]?.stopped).toBe(true);
  });
});

describe("micSource (Requirement 2.1)", () => {
  it("disables echo cancellation, noise suppression and auto gain", async () => {
    const { stream } = fakeStream(["audio"]);
    const getUserMedia = vi.fn(async () => stream);
    await micSource({ getUserMedia }).start(ctx);
    expect(getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS);
    expect(MIC_CONSTRAINTS.audio).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});
