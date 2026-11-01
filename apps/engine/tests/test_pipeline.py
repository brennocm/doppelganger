import io
import json
import struct
import wave
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from doppelganger_contracts.generated.model_manifest_schema import ModelManifest
from doppelganger_engine.audio_file import UnsupportedAudioError, decode_wav, resample, to_16k_mono
from doppelganger_engine.pipeline import (
    BadFrameError,
    StreamSession,
    Windower,
    decode_pcm16,
    encode_pcm16,
)

REPO = Path(__file__).resolve().parents[3]
GOLDEN = REPO / "packages/contracts/fixtures/golden"
MANIFEST = REPO / "apps/web/public/models/ci-synthetic-linear.json"


def golden(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((GOLDEN / name).read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def fake_manifest(window: int, hop: int) -> ModelManifest:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    data.update(windowSamples=window, hopSamples=hop, outputKind="single-logit", spoofIndex=0)
    return ModelManifest.model_validate(data)


def mean_logit(window: np.ndarray) -> list[float]:
    # Same as the TS fake: float64 sum in index order, then float32 like Float32Array.from.
    total = 0.0
    for v in window.tolist():
        total += v
    return [float(np.float32(40.0 * total / window.shape[0]))]


def test_pcm16_matches_the_ts_golden_vectors() -> None:
    for case in golden("pcm16.json")["cases"]:
        x = float("nan") if case["input"] == "NaN" else case["input"]
        assert int(encode_pcm16([x])[0]) == case["pcm"]
        decoded = decode_pcm16(struct.pack("<h", case["pcm"]))
        assert float(decoded[0]) == case["decoded"]


# Feature: local-runtime, Property 4: PCM16 round trip
@settings(max_examples=200)
@given(st.lists(st.floats(min_value=-1, max_value=1, width=32), max_size=500))
def test_pcm16_round_trip_error_is_at_most_one_step(values: list[float]) -> None:
    back = decode_pcm16(encode_pcm16(values).astype("<i2").tobytes())
    assert np.all(np.abs(back.astype(np.float64) - np.asarray(values)) <= 1 / 32768)


def test_odd_byte_frames_are_rejected() -> None:
    with pytest.raises(BadFrameError):
        decode_pcm16(b"\x00\x01\x02")


def test_windower_matches_the_windowing_golden_vectors() -> None:
    for case in golden("windowing.json")["cases"]:
        for split in case["chunkings"]:
            w = Windower(case["windowSamples"], case["hopSamples"])
            signal = np.asarray(case["signal"], dtype=np.float32)
            out, at = [], 0
            for size in split:
                out += w.push(signal[at : at + size])
                at += size
            assert [(i, win.tolist()) for i, win in out] == [
                (x["index"], x["samples"]) for x in case["windows"]
            ]


# Feature: local-runtime, Property 5: Stream parity with the detector
def test_stream_scores_equal_the_ts_detector() -> None:
    g = golden("stream.json")
    session = StreamSession(fake_manifest(g["windowSamples"], g["hopSamples"]), mean_logit)
    pcm = np.asarray(g["pcm"], dtype="<i2").tobytes()
    scores = []
    for at in range(0, len(pcm), 1600):  # 100 ms frames
        scores += session.feed(pcm[at : at + 1600])
    assert len(scores) == len(g["windows"])
    for got, want in zip(scores, g["windows"], strict=True):
        assert got["windowIndex"] == want["windowIndex"]
        assert (got["raw"] is None) == (want["raw"] is None)
        if want["raw"] is not None:
            assert got["raw"] == pytest.approx(want["raw"], abs=1e-9)
            assert got["smoothed"] == pytest.approx(want["smoothed"], abs=1e-9)


@settings(max_examples=200, deadline=None)
@given(st.integers(min_value=0, max_value=2**31), st.lists(st.integers(1, 3000), max_size=12))
def test_stream_parity_holds_for_any_chunking(seed: int, sizes: list[int]) -> None:
    g = golden("stream.json")
    manifest = fake_manifest(g["windowSamples"], g["hopSamples"])
    pcm = np.asarray(g["pcm"], dtype="<i2").tobytes()
    whole = StreamSession(manifest, mean_logit).feed(pcm)
    chunked, at = [], 0
    session = StreamSession(manifest, mean_logit)
    for size in [*sizes, len(pcm)]:
        n = size * 2
        chunked += session.feed(pcm[at : at + n])
        at += n
    assert seed >= 0
    assert chunked == whole


# Feature: local-runtime, Property 6: Bounded per-connection memory
@settings(max_examples=200, deadline=None)
@given(
    st.integers(min_value=1, max_value=64),
    st.integers(min_value=1, max_value=64),
    st.lists(st.integers(min_value=0, max_value=400), max_size=30),
)
def test_windower_never_holds_more_than_window_plus_hop(w: int, h: int, sizes: list[int]) -> None:
    windower = Windower(w, h)
    for size in sizes:
        windower.push(np.zeros(size, dtype=np.float32))
        assert windower.buffered <= w + h
    windower.clear()
    assert windower.buffered == 0


def wav_bytes(samples: np.ndarray, rate: int, channels: int = 1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(encode_pcm16(samples).astype("<i2").tobytes())
    return buf.getvalue()


def test_wav_decoding_and_resampling_length() -> None:
    tone = 0.5 * np.sin(2 * np.pi * 440 * np.arange(48000) / 48000)
    stereo = np.repeat(tone, 2)
    frames, rate = decode_wav(wav_bytes(stereo, 48000, channels=2))
    assert (frames.shape, rate) == ((48000, 2), 48000)
    mono = to_16k_mono(wav_bytes(tone, 48000))
    assert mono.shape == (16000,)
    assert float(np.max(np.abs(mono))) <= 1.0
    assert resample(np.ones(44100) * 0.25, 44100).shape == (16000,)


def test_float_wav_is_decoded() -> None:
    data = np.full(1600, 0.25, dtype="<f4").tobytes()
    fmt = struct.pack("<HHIIHH", 3, 1, 16000, 64000, 4, 32)
    riff = b"WAVEfmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", len(data)) + data
    frames, _ = decode_wav(b"RIFF" + struct.pack("<I", len(riff)) + riff)
    assert float(frames[0, 0]) == pytest.approx(0.25)


@pytest.mark.parametrize("data", [b"", b"ID3" + b"\0" * 100, b"RIFF\0\0\0\0WAVEjunk"])
def test_other_formats_are_unsupported(data: bytes) -> None:
    with pytest.raises(UnsupportedAudioError):
        decode_wav(data)
