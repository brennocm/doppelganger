import asyncio
import hmac
import inspect
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from doppelganger_engine import guards
from doppelganger_engine.config import ConfigError, load_settings

ALLOWED = "http://127.0.0.1:8787"
TOKEN_CHARS = 43  # 32 bytes in URL-safe base64
REPO = Path(__file__).resolve().parents[3]
MODELS = REPO / "apps/web/public/models"


def env(**overrides: str) -> dict[str, str]:
    base = {"MODEL_DIR": str(MODELS), "MODEL_ID": "ci-synthetic-linear"}
    return {**base, **overrides}


def test_settings_have_safe_defaults() -> None:
    s = load_settings(env())
    assert (s.port, s.allowed_origin, s.log_level) == (8787, ALLOWED, "info")
    assert s.manifest_path.name == "ci-synthetic-linear.json"


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("PORT", "0"),
        ("PORT", "eighty"),
        ("MODEL_ID", "../etc"),
        ("MODEL_ID", "missing-model"),
        ("ALLOWED_ORIGIN", "http://0.0.0.0:8787"),
        ("ALLOWED_ORIGIN", "http://127.0.0.1:8787/"),
        ("ALLOWED_ORIGIN", "https://evil.example"),
        ("LOG_LEVEL", "trace"),
        ("MODEL_DIR", "/" + "nonexistent-dir"),
    ],
)
def test_invalid_settings_name_the_variable(key: str, value: str) -> None:
    with pytest.raises(ConfigError, match=f"^{key}:"):
        load_settings(env(**{key: value}))


def test_model_id_is_required() -> None:
    with pytest.raises(ConfigError, match=r"^MODEL_ID:"):
        load_settings({"MODEL_DIR": str(MODELS)})


# Feature: local-runtime, Property 1: Origin guard
@settings(max_examples=200)
@given(
    st.one_of(
        st.none(),
        st.text(max_size=40),
        st.sampled_from(
            [
                ALLOWED,
                ALLOWED + "/",
                ALLOWED.upper(),
                "http://localhost:8787",
                "http://127.0.0.1:8788",
                "https://127.0.0.1:8787",
                "null",
                "",
                " " + ALLOWED,
            ]
        ),
    )
)
def test_origin_guard_accepts_only_the_exact_origin(origin: str | None) -> None:
    assert guards.origin_ok(origin, ALLOWED) == (origin == ALLOWED)


# Feature: local-runtime, Property 2: Token guard
@settings(max_examples=200)
@given(st.one_of(st.text(max_size=60), st.none(), st.integers(), st.just("SAME")))
def test_token_guard_accepts_only_the_session_token(candidate: object) -> None:
    token = guards.new_token()
    value = token if candidate == "SAME" else candidate
    assert guards.token_ok(value, token) == (value == token)


def test_token_is_32_random_bytes_and_compared_in_constant_time() -> None:
    token = guards.new_token()
    assert len(token) >= TOKEN_CHARS
    assert token != guards.new_token()
    assert "compare_digest" in inspect.getsource(guards.token_ok)
    assert hmac.compare_digest is not None


def test_bearer_header() -> None:
    assert guards.bearer("Bearer abc") == "abc"
    assert guards.bearer("bearer abc") is None
    assert guards.bearer(None) is None


def test_failure_limiter_blocks_after_ten_failures_per_minute() -> None:
    now = [0.0]
    limiter = guards.FailureLimiter(clock=lambda: now[0])
    for _ in range(10):
        assert not limiter.blocked("a")
        limiter.fail("a")
    assert limiter.blocked("a")
    assert not limiter.blocked("b")
    now[0] += 6.0  # one token back every 6 s
    assert not limiter.blocked("a")


async def _chunks(sizes: list[int], read: list[int]) -> AsyncIterator[bytes]:
    for size in sizes:
        read.append(size)
        yield b"\0" * size


# Feature: local-runtime, Property 3: Size guard
@settings(max_examples=200, deadline=None)
@given(
    st.lists(st.integers(min_value=0, max_value=4 * 1024 * 1024), max_size=12),
    st.one_of(
        st.none(), st.integers(min_value=-5, max_value=60 * 1024 * 1024).map(str), st.just("12abc")
    ),
)
def test_size_guard_never_buffers_past_the_limit(sizes: list[int], declared: str | None) -> None:
    limit = guards.MAX_UPLOAD_BYTES
    if guards.declared_too_large(declared):
        assert declared is not None
        assert not declared.lstrip("-").isdigit() or not (0 <= int(declared) <= limit)
    read: list[int] = []
    total = sum(sizes)
    try:
        body = asyncio.run(guards.read_limited(_chunks(sizes, read)))
    except guards.TooLargeError:
        assert total > limit
        # Stopped at the first chunk that crossed the limit: never more than limit + one chunk.
        assert sum(read) - read[-1] <= limit
        return
    assert len(body) == total <= limit
