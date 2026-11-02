"""Stream pipeline: ports of the detector's windowing and voice activity check.

Parity with `packages/detector` is asserted against the TS-written golden vectors in
`packages/contracts/fixtures/golden/` (local-runtime Requirement 3.2, Property 5).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Final

import numpy as np
import numpy.typing as npt

from model_lab.inference import HauntingConfig, InferenceError, Smoother, score_logits

if TYPE_CHECKING:
    from doppelganger_contracts.generated.model_manifest_schema import ModelManifest

Audio = npt.NDArray[np.float32]

VAD_FRAME_SAMPLES: Final = 320
MIN_LAST_FRAME: Final = VAD_FRAME_SAMPLES // 2


class BadFrameError(ValueError):
    """A binary frame is not whole PCM16 samples."""


def decode_pcm16(frame: bytes) -> Audio:
    """PCM16 little-endian bytes to float32 in [-1, 1): n / 32768."""
    if len(frame) % 2 != 0:
        raise BadFrameError
    return (np.frombuffer(frame, dtype="<i2").astype(np.float32)) / np.float32(32768.0)


def encode_pcm16(samples: npt.ArrayLike) -> npt.NDArray[np.int16]:
    """Float samples to PCM16: round(clamp(x) * 32768), clamped; NaN as 0."""
    x = np.nan_to_num(np.asarray(samples, dtype=np.float64), nan=0.0, posinf=1.0, neginf=-1.0)
    scaled = np.clip(x, -1.0, 1.0) * 32768.0
    # JS Math.round rounds halves up; numpy rounds halves to even, so use floor(x + 0.5).
    return np.clip(np.floor(scaled + 0.5), -32768, 32767).astype(np.int16)


@dataclass(frozen=True)
class VadConfig:
    """Same defaults as the TS DEFAULT_VAD."""

    min_rms: float = 0.01
    max_zero_crossing_rate: float = 0.35
    min_voiced_fraction: float = 0.3


def _frame_voiced(window: Audio, start: int, end: int, cfg: VadConfig) -> bool:
    energy = 0.0
    crossings = 0
    previous = 0.0
    for i in range(start, end):
        v = float(window[i])
        if not math.isfinite(v):
            return False
        energy += v * v
        if i > start and (v >= 0) != (previous >= 0):
            crossings += 1
        previous = v
    length = end - start
    rms = math.sqrt(energy / length)
    zcr = crossings / (length - 1) if length > 1 else 0.0
    return rms >= cfg.min_rms and zcr <= cfg.max_zero_crossing_rate


def is_voiced(window: Audio, cfg: VadConfig) -> bool:
    """Port of `isVoiced`: enough 20 ms frames with speech-like energy and crossings."""
    frames = 0
    voiced = 0
    for start in range(0, window.shape[0], VAD_FRAME_SAMPLES):
        end = min(start + VAD_FRAME_SAMPLES, window.shape[0])
        if end - start < MIN_LAST_FRAME and frames > 0:
            break
        frames += 1
        if _frame_voiced(window, start, end, cfg):
            voiced += 1
    return frames > 0 and voiced / frames >= cfg.min_voiced_fraction


class Windower:
    """Bounded port of `createWindower`: never holds more than window + hop samples."""

    def __init__(self, window: int, hop: int) -> None:
        """Preallocate the per-connection buffer (Requirement 3.4)."""
        if window < 1 or hop < 1:
            msg = "window and hop must be at least 1"
            raise ValueError(msg)
        self.window = window
        self.hop = hop
        self._buf = np.zeros(window + hop, dtype=np.float32)
        self._count = 0
        self._skip = 0
        self._next_index = 0

    @property
    def buffered(self) -> int:
        """Samples held right now (Property 6)."""
        return self._count

    def push(self, samples: Audio) -> list[tuple[int, Audio]]:
        """Append samples; return (index, window copy) for every completed window."""
        out: list[tuple[int, Audio]] = []
        at = 0
        while at < samples.shape[0]:
            if self._skip > 0:
                dropped = min(self._skip, samples.shape[0] - at)
                self._skip -= dropped
                at += dropped
                continue
            # At most one hop per step, so the buffer never exceeds window + hop.
            take = min(self.hop, samples.shape[0] - at, self._buf.shape[0] - self._count)
            self._buf[self._count : self._count + take] = samples[at : at + take]
            self._count += take
            at += take
            while self._count >= self.window:
                out.append((self._next_index, self._buf[: self.window].copy()))
                self._next_index += 1
                if self.hop <= self.window:
                    rest = self._count - self.hop
                    self._buf[:rest] = self._buf[self.hop : self._count].copy()
                    self._count = rest
                else:
                    self._skip = self.hop - self._count
                    self._count = 0
        return out

    def clear(self) -> None:
        """Drop all audio (connection closed)."""
        self._buf[:] = 0.0
        self._count = 0
        self._skip = 0


Logits = Callable[[Audio], list[float]]


class StreamSession:
    """One WebSocket connection: PCM16 frames in, one score message per window out."""

    def __init__(
        self,
        manifest: ModelManifest,
        logits: Logits,
        cfg: HauntingConfig | None = None,
        vad: VadConfig | None = None,
    ) -> None:
        """Set up the per-connection windower and smoother."""
        self.manifest = manifest
        self._logits = logits
        self._cfg = cfg if cfg is not None else HauntingConfig()
        self._vad = vad if vad is not None else VadConfig()
        self._windower = Windower(manifest.windowSamples, manifest.hopSamples)
        self._smoother = Smoother(self._cfg.alpha)

    @property
    def buffered(self) -> int:
        """Samples held for this connection."""
        return self._windower.buffered

    def score_window(self, window: Audio) -> tuple[bool, float | None, float | None]:
        """(voiced, raw, smoothed) like the detector: unvoiced or failed windows have no score."""
        if not is_voiced(window, self._vad):
            return False, None, None
        try:
            raw = score_logits(self._logits(window), self.manifest)
        except InferenceError:
            return True, None, None
        return True, raw, self._smoother.next(raw)

    def push(self, samples: Audio) -> list[tuple[int, bool, float | None, float | None]]:
        """Window and score float samples: (index, voiced, raw, smoothed) per window."""
        return [(i, *self.score_window(w)) for i, w in self._windower.push(samples)]

    def feed(self, frame: bytes) -> list[dict[str, object]]:
        """Decode one PCM16 binary frame; return a score message per completed window."""
        return [
            {
                "type": "score",
                "windowIndex": index,
                "raw": raw,
                "smoothed": smoothed,
                "modelId": self.manifest.id,
            }
            for index, _voiced, raw, smoothed in self.push(decode_pcm16(frame))
        ]

    def close(self) -> None:
        """Drop the audio held for this connection."""
        self._windower.clear()
