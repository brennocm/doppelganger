import tomllib
from pathlib import Path

import findings as fd
import prompt_logger as pl
import pytest
import token_shapes

ROOT = Path(__file__).resolve().parents[2]

# Built at run time, in pieces, so the repository's own gitleaks rules never see a whole
# token shape in this file. All are fake and deliberately low-entropy.
LOW_ENTROPY = {
    "token-shape-github-classic": "ghp" + "_" + "FAKE" * 9,
    "token-shape-github-fine-grained": "github" + "_pat_" + "FAKE" * 6,
    "token-shape-huggingface": "hf" + "_" + "FAKE" * 8,
    "token-shape-sk": "sk" + "-" + "FAKE" * 6,
    "token-shape-aws-access-key": "AKIA" + "FAKE" * 4,
    "token-shape-slack": "xoxb" + "-" + "FAKE" * 4,
}
GHO = "gho" + "_" + "FAKE" * 9
XOXP = "xoxp" + "-" + "FAKE" * 4


@pytest.mark.parametrize(
    ("rule", "value"),
    [*LOW_ENTROPY.items(), ("token-shape-github-classic", GHO), ("token-shape-slack", XOXP)],
    ids=[*LOW_ENTROPY, "gho", "xoxp"],  # never put the token itself in a test ID
)
def test_low_entropy_shapes_are_found(rule: str, value: str) -> None:
    assert [(m.rule, m.value) for m in token_shapes.find(f"use {value} now")] == [(rule, value)]


@pytest.mark.parametrize(
    "text",
    [
        "ghp" + "_short",
        "task-1234 and risk-assessment",
        "sk" + "-tiny",
        "AKIA" + "lowercase0000000",
        "hf" + "_hub and hf" + "_fs are tool names",
        "xoxa" + "-not-a-bot-token",
    ],
)
def test_lookalikes_are_ignored(text: str) -> None:
    assert token_shapes.find(text) == []


def test_redact_leaves_no_token_shape() -> None:
    text = " ".join(LOW_ENTROPY.values())
    redacted = token_shapes.redact(text)
    assert token_shapes.find(redacted) == []
    assert redacted.count(token_shapes.PLACEHOLDER) == len(LOW_ENTROPY)


def test_gitleaks_config_has_the_same_rules() -> None:
    config = tomllib.loads((ROOT / ".gitleaks.toml").read_text(encoding="utf-8"))
    assert config["extend"]["useDefault"] is True
    assert {rule["id"]: rule["regex"] for rule in config["rules"]} == token_shapes.SHAPES


def test_prompt_logger_redacts_shapes_gitleaks_misses(tmp_path: Path) -> None:
    history = tmp_path / "prompt-history.md"
    history.write_text("# Prompt history\n")
    token = LOW_ENTROPY["token-shape-github-classic"]
    status = pl.log_prompt(history, f"token {token}", pl.dt.date(2026, 10, 31), lambda _t: [])
    assert "redacted" in status
    assert token not in history.read_text()
    assert f"token {token_shapes.PLACEHOLDER}" in history.read_text()


def test_secret_sentinel_reports_shapes_gitleaks_misses(tmp_path: Path) -> None:
    token = LOW_ENTROPY["token-shape-huggingface"]
    (tmp_path / "a.txt").write_text(f"x\nkey = {token}\n")
    found = fd.scan_secrets(tmp_path, "a.txt", lambda _f: [])
    assert [(f.kind, f.line, f.detail) for f in found] == [
        ("secret (token-shape-huggingface)", 2, "hf_F…")
    ]
    assert all(token not in f.detail for f in found)


def test_secret_sentinel_does_not_report_a_gitleaks_hit_twice(tmp_path: Path) -> None:
    token = LOW_ENTROPY["token-shape-github-classic"]
    (tmp_path / "a.txt").write_text(f"{token}\n")
    found = fd.scan_secrets(tmp_path, "a.txt", lambda _f: [(1, "github-pat", token)])
    assert [f.kind for f in found] == ["secret (github-pat)"]
