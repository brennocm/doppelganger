import datetime as dt
from pathlib import Path

import prompt_logger as pl
import pytest

TODAY = dt.date(2026, 10, 30)
FAKE_TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
REAL_EMAIL = "jane.doe" + "@" + "gmail.com"
HEADER = (
    "# Prompt history\n\n---\n\n"
    "## 001 — 2026-10-30 — CLI — vibe\n\n```text\nfirst\n```\n\nOutcome: done\n"
)


def fake_scanner(text: str) -> list[str]:
    return [FAKE_TOKEN] if FAKE_TOKEN in text else []


def failing_scanner(_text: str) -> list[str]:
    msg = "gitleaks missing"
    raise pl.RedactionError(msg)


@pytest.fixture
def history(tmp_path: Path) -> Path:
    path = tmp_path / "prompt-history.md"
    path.write_text(HEADER)
    return path


def test_appends_next_entry_with_pending_outcome(history: Path) -> None:
    status = pl.log_prompt(history, "do the thing", TODAY, fake_scanner)
    text = history.read_text()
    assert status == "prompt-logger: logged entry 002"
    assert "## 002 — 2026-10-30 — set by hand — set by hand" in text
    assert text.endswith("```text\ndo the thing\n```\n\nOutcome: _pending_\n")
    assert text.startswith(HEADER)


def test_writes_the_cli_surface_when_given(history: Path) -> None:
    pl.log_prompt(history, "from the CLI", TODAY, fake_scanner, "CLI")
    assert "## 002 — 2026-10-30 — CLI — set by hand\n" in history.read_text()


@pytest.mark.parametrize(
    ("user_agent", "surface"),
    [
        ("KiroCLI/2.37.0 KAS/0.66.70 os/linux", "CLI"),
        ("KiroIDE/1.0", "set by hand"),
        ("", "set by hand"),
        ("Mozilla KiroCLI/2.37.0", "set by hand"),
    ],
    ids=["cli", "other-product", "empty", "not-a-prefix"],
)
def test_detects_the_surface_from_the_user_agent(user_agent: str, surface: str) -> None:
    assert pl.detect_surface({"KIRO_CUSTOM_USER_AGENT": user_agent}) == surface


def test_surface_is_unknown_without_the_variable() -> None:
    assert pl.detect_surface({}) == "set by hand"


def test_redacts_secrets_and_personal_data_before_writing(history: Path) -> None:
    pl.log_prompt(history, f"use {FAKE_TOKEN} and mail {REAL_EMAIL}", TODAY, fake_scanner)
    text = history.read_text()
    assert FAKE_TOKEN not in text
    assert REAL_EMAIL not in text
    assert "<redacted-secret>" in text
    assert "user@example.com" in text


def test_writes_nothing_when_redaction_fails(history: Path) -> None:
    status = pl.log_prompt(history, f"secret {FAKE_TOKEN}", TODAY, failing_scanner)
    assert "WARNING" in status
    assert history.read_text() == HEADER


def test_writes_nothing_when_something_survives_redaction(history: Path) -> None:
    def scanner_that_always_finds(_text: str) -> list[str]:
        return ["not-in-text"]

    status = pl.log_prompt(history, "hello", TODAY, scanner_that_always_finds)
    assert "WARNING" in status
    assert history.read_text() == HEADER


def test_does_not_duplicate_the_last_entry(history: Path) -> None:
    pl.log_prompt(history, "same prompt", TODAY, fake_scanner)
    status = pl.log_prompt(history, "same prompt", TODAY, fake_scanner)
    assert "nothing written" in status
    assert history.read_text().count("## 002 ") == 1
    assert "## 003 " not in history.read_text()


def test_uses_a_longer_fence_when_the_prompt_has_backticks(history: Path) -> None:
    pl.log_prompt(history, "run:\n```sh\nls\n```", TODAY, fake_scanner)
    text = history.read_text()
    assert "````text\nrun:\n```sh\nls\n```\n````" in text
    status = pl.log_prompt(history, "run:\n```sh\nls\n```", TODAY, fake_scanner)
    assert "nothing written" in status


def test_empty_prompt_writes_nothing(history: Path) -> None:
    pl.log_prompt(history, "   ", TODAY, fake_scanner)
    assert history.read_text() == HEADER
