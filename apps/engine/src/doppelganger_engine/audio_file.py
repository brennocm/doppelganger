"""In-memory WAV decoding and resampling for Autopsy (local-runtime Requirement 4, P29).

A small RIFF parser instead of `wave`, which cannot read 32-bit float WAV. The bytes are
never written anywhere; the result is a 16 kHz mono float32 array.
"""

from __future__ import annotations

import math
import struct
from typing import Final

import numpy as np
import numpy.typing as npt

Audio = npt.NDArray[np.float32]
TARGET_RATE: Final = 16_000
TAPS: Final = 32
DELAY: Final = TAPS // 2
SUPPORTED_FORMATS: Final = ("wav",)
_PCM, _FLOAT, _EXTENSIBLE = 1, 3, 0xFFFE
_RIFF_HEADER: Final = 12
_FMT_SIZE: Final = 16
_EXTENSIBLE_SIZE: Final = 26
_MIN_RATE, _MAX_RATE = 1000, 768_000
_BITS_8, _BITS_16, _BITS_24, _BITS_32 = 8, 16, 24, 32


class UnsupportedAudioError(ValueError):
    """Not a WAV file this decoder reads."""


def _chunks(data: bytes) -> dict[bytes, bytes]:
    if len(data) < _RIFF_HEADER or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise UnsupportedAudioError
    chunks: dict[bytes, bytes] = {}
    at = _RIFF_HEADER
    while at + 8 <= len(data):
        cid = data[at : at + 4]
        (size,) = struct.unpack_from("<I", data, at + 4)
        body = data[at + 8 : at + 8 + size]
        chunks.setdefault(cid, body)
        at += 8 + size + (size & 1)
    if b"fmt " not in chunks or b"data" not in chunks:
        raise UnsupportedAudioError
    return chunks


def decode_wav(data: bytes) -> tuple[npt.NDArray[np.float64], int]:
    """Return (frames-by-channels samples in [-1, 1], sample rate)."""
    chunks = _chunks(data)
    fmt = chunks[b"fmt "]
    if len(fmt) < _FMT_SIZE:
        raise UnsupportedAudioError
    tag, channels, rate, _, align, bits = struct.unpack_from("<HHIIHH", fmt)
    if tag == _EXTENSIBLE and len(fmt) >= _EXTENSIBLE_SIZE:
        (tag,) = struct.unpack_from("<H", fmt, 24)
    if channels < 1 or rate < _MIN_RATE or rate > _MAX_RATE or align != channels * (bits // 8):
        raise UnsupportedAudioError
    raw = chunks[b"data"]
    usable = len(raw) - len(raw) % align
    raw = raw[:usable]
    if tag == _PCM and bits == _BITS_8:
        x = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0) / 128.0
    elif tag == _PCM and bits == _BITS_16:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif tag == _PCM and bits == _BITS_24:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / float(1 << 23)
    elif tag == _PCM and bits == _BITS_32:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / float(1 << 31)
    elif tag == _FLOAT and bits == _BITS_32:
        x = np.nan_to_num(np.frombuffer(raw, dtype="<f4").astype(np.float64))
    else:
        raise UnsupportedAudioError
    return np.clip(x, -1.0, 1.0).reshape(-1, channels), rate


def _blackman(x: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    u = np.pi * x / DELAY
    out: npt.NDArray[np.float64] = 0.42 + 0.5 * np.cos(u) + 0.08 * np.cos(2 * u)
    return out


def resample(mono: npt.NDArray[np.float64], rate: int) -> Audio:
    """Port of the browser's causal 32-tap polyphase resampler (audio-capture design)."""
    g = math.gcd(rate, TARGET_RATE)
    up, down = TARGET_RATE // g, rate // g
    n = mono.shape[0]
    count = -(-(n * up) // down)  # ceil(n * L / M)
    if count == 0:
        return np.zeros(0, dtype=np.float32)
    cutoff = 0.46 * min(1.0, up / down)
    k = np.arange(count, dtype=np.int64)
    i0 = (k * down) // up
    phase = (k * down) % up
    padded = np.concatenate([np.zeros(TAPS - 1), mono])
    out = np.empty(count, dtype=np.float64)
    t = np.arange(TAPS, dtype=np.float64)
    for start in range(0, count, 65_536):
        sl = slice(start, min(count, start + 65_536))
        x = phase[sl, None] / up + (DELAY - 1) - t[None, :]
        taps = 2 * cutoff * np.sinc(2 * cutoff * x) * _blackman(x)
        taps[np.abs(x) > DELAY] = 0.0
        taps /= taps.sum(axis=1, keepdims=True)
        idx = i0[sl, None] + t[None, :].astype(np.int64)  # padded index of input i0-31+t
        out[sl] = np.sum(taps * padded[idx], axis=1)
    return np.clip(out, -1.0, 1.0).astype(np.float32)


def to_16k_mono(data: bytes) -> Audio:
    """Decode WAV bytes, downmix to mono and resample to 16 kHz."""
    frames, rate = decode_wav(data)
    return resample(frames.mean(axis=1), rate)
