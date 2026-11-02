"""WAV decoding for Autopsy; the code lives in model_lab, shared with the MCP server (P36)."""

from model_lab.inference import (
    MAX_SECONDS,
    SUPPORTED_FORMATS,
    TooLongError,
    UnsupportedAudioError,
    decode_wav,
    resample,
    to_16k_mono,
)

__all__ = [
    "MAX_SECONDS",
    "SUPPORTED_FORMATS",
    "TooLongError",
    "UnsupportedAudioError",
    "decode_wav",
    "resample",
    "to_16k_mono",
]
