"""Codec_Conditions: call-like degradations applied to 16 kHz mono float32 audio.

Everything happens in memory. Audio goes to ffmpeg through stdin and comes back through
stdout as raw float32 samples; nothing is ever written to disk (security steering).
"""

from __future__ import annotations

import shutil
import subprocess
from enum import StrEnum
from typing import Final

import numpy as np
import numpy.typing as npt

SAMPLE_RATE: Final = 16_000
_FFMPEG_TIMEOUT_S: Final = 120
#: Largest length change allowed before trim/pad: three 20 ms Opus frames at 16 kHz.
FRAME_SLACK_SAMPLES: Final = 960
NOISE_SNR_DB: Final = 10.0

Audio = npt.NDArray[np.float32]


class CodecCondition(StrEnum):
    """The evaluation conditions from detection-model Requirement 2.1."""

    CLEAN = "clean"
    OPUS_16K = "opus-16k"
    OPUS_32K = "opus-32k"
    BAND_8K = "band-8k"
    NOISE_10DB = "noise-10db"


class FfmpegMissingError(RuntimeError):
    """ffmpeg is not installed or not on PATH."""

    def __init__(self) -> None:
        """Explain how to install ffmpeg."""
        super().__init__(
            "ffmpeg not found on PATH; install it (Debian/Ubuntu: sudo apt-get install ffmpeg)"
        )


class CodecError(RuntimeError):
    """ffmpeg failed to process the audio."""


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe is None:
        raise FfmpegMissingError
    return exe


_RAW_IN: Final = ("-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0")
_RAW_OUT: Final = ("-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1")


def _pipe(args: tuple[str, ...], data: bytes) -> bytes:
    """Run ffmpeg with stdin and stdout as in-memory pipes and return stdout."""
    command = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", *args]
    # Fixed argument lists built in this module; audio travels only through the pipes.
    result = subprocess.run(  # noqa: S603
        command, input=data, capture_output=True, check=False, timeout=_FFMPEG_TIMEOUT_S
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()[-1:]
        msg = f"ffmpeg exited with {result.returncode}: {' '.join(detail)}"
        raise CodecError(msg)
    return result.stdout


def _raw(audio: Audio) -> bytes:
    return audio.astype("<f4", copy=False).tobytes()


def _from_raw(data: bytes) -> Audio:
    return np.frombuffer(data, dtype="<f4").astype(np.float32)


def decode(data: bytes) -> Audio:
    """Decode any ffmpeg-readable file content (WAV, FLAC, Opus...) to 16 kHz mono float32."""
    if not data:
        msg = "empty audio file"
        raise CodecError(msg)
    return _from_raw(_pipe(("-i", "pipe:0", *_RAW_OUT), data))


def _opus(audio: Audio, bitrate_kbps: int) -> Audio:
    encoded = _pipe(
        (*_RAW_IN, "-c:a", "libopus", "-b:a", f"{bitrate_kbps}k", "-f", "ogg", "pipe:1"),
        _raw(audio),
    )
    return _from_raw(_pipe(("-f", "ogg", "-i", "pipe:0", *_RAW_OUT), encoded))


def _band_8k(audio: Audio) -> Audio:
    telephone = "highpass=f=300,lowpass=f=3400,aresample=8000,aresample=16000"
    return _from_raw(_pipe((*_RAW_IN, "-af", telephone, *_RAW_OUT), _raw(audio)))


def _noise(audio: Audio, snr_db: float, seed: int) -> Audio:
    signal_power = float(np.mean(np.square(audio, dtype=np.float64)))
    if signal_power == 0.0:
        return audio.copy()
    noise = np.random.default_rng(seed).standard_normal(audio.shape[0])
    scale = float(np.sqrt(signal_power / (10.0 ** (snr_db / 10.0))))
    noisy: Audio = (audio + scale * noise).astype(np.float32)
    return noisy


def fit_length(audio: Audio, length: int) -> Audio:
    """Trim or zero-pad audio to exactly length samples."""
    if audio.shape[0] >= length:
        return audio[:length].copy()
    padded = np.zeros(length, dtype=np.float32)
    padded[: audio.shape[0]] = audio
    return padded


def simulate_raw(audio: Audio, condition: CodecCondition, seed: int = 0) -> Audio:
    """Apply a condition without trimming; codecs may add or drop a few frames."""
    if audio.ndim != 1:
        msg = f"expected mono audio (1-D array), got shape {audio.shape}"
        raise ValueError(msg)
    if not np.all(np.isfinite(audio)):
        msg = "audio contains NaN or infinite samples"
        raise ValueError(msg)
    samples = audio.astype(np.float32, copy=False)
    if samples.shape[0] == 0 or condition is CodecCondition.CLEAN:
        return samples.copy()
    match condition:
        case CodecCondition.OPUS_16K:
            return _opus(samples, 16)
        case CodecCondition.OPUS_32K:
            return _opus(samples, 32)
        case CodecCondition.BAND_8K:
            return _band_8k(samples)
        case CodecCondition.NOISE_10DB:
            return _noise(samples, NOISE_SNR_DB, seed)


def simulate(audio: Audio, condition: CodecCondition, seed: int = 0) -> Audio:
    """Apply a condition and return exactly as many samples as the input, in [-1, 1]."""
    out = fit_length(simulate_raw(audio, condition, seed), audio.shape[0])
    return np.clip(out, -1.0, 1.0).astype(np.float32)
