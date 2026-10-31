import shutil

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from model_lab import codecs, synthetic
from model_lab.codecs import CodecCondition

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
SECOND = codecs.SAMPLE_RATE
STOPBAND_RMS = 0.01
SNR_TOLERANCE_DB = 0.5


@needs_ffmpeg
@pytest.mark.parametrize("condition", list(CodecCondition))
def test_every_condition_keeps_length_and_range(condition: CodecCondition) -> None:
    audio = synthetic.signal("chirp", 2 * SECOND, seed=1)
    out = codecs.simulate(audio, condition, seed=3)
    assert out.shape == audio.shape
    assert out.dtype == np.float32
    assert np.all(np.abs(out) <= 1.0)


@needs_ffmpeg
@pytest.mark.parametrize(
    "condition", [CodecCondition.OPUS_16K, CodecCondition.OPUS_32K, CodecCondition.BAND_8K]
)
def test_codecs_change_the_signal_but_keep_it_correlated(condition: CodecCondition) -> None:
    audio = synthetic.signal("sine", 2 * SECOND, seed=2)
    out = codecs.simulate(audio, condition)
    assert not np.array_equal(out, audio)
    # Lag-tolerant check: the codec output still carries most of the input's energy.
    assert float(np.sqrt(np.mean(out**2))) > 0.5 * float(np.sqrt(np.mean(audio**2)))


@needs_ffmpeg
def test_band_8k_removes_content_above_4_khz() -> None:
    t = np.arange(SECOND) / SECOND
    tone = (0.5 * np.sin(2 * np.pi * 6000 * t)).astype(np.float32)
    out = codecs.simulate(tone, CodecCondition.BAND_8K)
    assert float(np.sqrt(np.mean(out**2))) < STOPBAND_RMS


def test_noise_hits_the_target_snr_and_is_seeded() -> None:
    audio = synthetic.signal("sine", SECOND, seed=4)
    a = codecs.simulate_raw(audio, CodecCondition.NOISE_10DB, seed=9)
    b = codecs.simulate_raw(audio, CodecCondition.NOISE_10DB, seed=9)
    c = codecs.simulate_raw(audio, CodecCondition.NOISE_10DB, seed=10)
    assert np.array_equal(a, b)
    assert not np.array_equal(a, c)
    noise = a - audio
    snr = 10 * np.log10(np.mean(audio.astype(np.float64) ** 2) / np.mean(noise**2))
    assert abs(snr - codecs.NOISE_SNR_DB) < SNR_TOLERANCE_DB


def test_silence_gets_no_noise_and_clean_is_identity() -> None:
    silence = np.zeros(400, dtype=np.float32)
    assert np.array_equal(codecs.simulate(silence, CodecCondition.NOISE_10DB), silence)
    audio = synthetic.signal("noise", 400, seed=1)
    assert np.array_equal(codecs.simulate(audio, CodecCondition.CLEAN), audio)


@pytest.mark.parametrize("bad", [np.nan, np.inf, -np.inf])
def test_non_finite_samples_are_rejected(bad: float) -> None:
    audio = np.zeros(100, dtype=np.float32)
    audio[50] = bad
    with pytest.raises(ValueError, match="NaN or infinite"):
        codecs.simulate(audio, CodecCondition.OPUS_16K)


def test_stereo_is_rejected() -> None:
    with pytest.raises(ValueError, match="mono"):
        codecs.simulate(np.zeros((2, 10), dtype=np.float32), CodecCondition.CLEAN)


def test_missing_ffmpeg_names_the_fix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(codecs.shutil, "which", lambda _name: None)
    with pytest.raises(codecs.FfmpegMissingError, match="apt-get install ffmpeg"):
        codecs.simulate(np.ones(10, dtype=np.float32) * 0.1, CodecCondition.OPUS_16K)


def test_fit_length_trims_and_pads() -> None:
    audio = np.arange(5, dtype=np.float32)
    assert codecs.fit_length(audio, 3).tolist() == [0, 1, 2]
    assert codecs.fit_length(audio, 7).tolist() == [0, 1, 2, 3, 4, 0, 0]


# Lengths include the edge values: empty, one sample, one Opus frame, around one second.
_LENGTHS = st.one_of(
    st.sampled_from([0, 1, 2, 319, 320, 321, SECOND - 1, SECOND, SECOND + 1]),
    st.integers(min_value=0, max_value=2 * SECOND),
)


# Feature: detection-model, Property 3: Codec simulation preserves length
@needs_ffmpeg
@settings(max_examples=200, deadline=None)
@given(
    samples=_LENGTHS,
    condition=st.sampled_from(list(CodecCondition)),
    kind=st.sampled_from(synthetic.KINDS),
    seed=st.integers(min_value=0, max_value=2**16),
)
def test_property_codec_simulation_preserves_length(
    samples: int, condition: CodecCondition, kind: synthetic.Kind, seed: int
) -> None:
    audio = synthetic.signal(kind, samples, seed=seed)
    raw = codecs.simulate_raw(audio, condition, seed=seed)
    tolerance = max(0.01 * samples, codecs.FRAME_SLACK_SAMPLES)
    assert abs(raw.shape[0] - samples) <= tolerance
    assert codecs.simulate(audio, condition, seed=seed).shape == (samples,)
