import json
import subprocess
from pathlib import Path

import journal_keeper as jk
import pytest

SESSION = "test-session"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)  # noqa: S603, S607


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "config", "user.name", "Test")
    git(tmp_path, "config", "user.email", "test@example.com")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs/kiro-journal.md").write_text("# Journal\n")
    (tmp_path / "docs/prompt-history.md").write_text("# Prompts\n")
    (tmp_path / "src.ts").write_text("export {};\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "init")
    return tmp_path


def test_asks_once_when_code_changed(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    (repo / "src.ts").write_text("export const x = 1;\n")
    decision = jk.check(repo, SESSION)
    assert decision is not None
    assert json.loads(decision)["decision"] == "block"


def test_no_loop_after_asking(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    (repo / "src.ts").write_text("export const x = 1;\n")
    assert jk.check(repo, SESSION) is not None
    # The follow-up turn ends without writing the journal: still no second request.
    (repo / "src.ts").write_text("export const x = 2;\n")
    assert jk.check(repo, SESSION) is None
    assert jk.check(repo, SESSION) is None


def test_never_asks_when_only_journal_or_prompt_history_changed(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    (repo / "docs/kiro-journal.md").write_text("# Journal\n\n## entry\n")
    (repo / "docs/prompt-history.md").write_text("# Prompts\n\n## 001\n")
    assert jk.check(repo, SESSION) is None


def test_no_request_when_journal_was_updated_in_the_turn(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    (repo / "src.ts").write_text("export const x = 1;\n")
    (repo / "docs/kiro-journal.md").write_text("# Journal\n\n## entry\n")
    assert jk.check(repo, SESSION) is None


def test_no_request_when_nothing_changed(repo: Path) -> None:
    (repo / "src.ts").write_text("dirty before the turn\n")
    jk.snapshot(repo, SESSION)
    assert jk.check(repo, SESSION) is None


def test_detects_files_committed_during_the_turn(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    (repo / "new.ts").write_text("export {};\n")
    git(repo, "add", "new.ts")
    git(repo, "commit", "-q", "-m", "add")
    assert jk.check(repo, SESSION) is not None


def test_no_snapshot_means_no_request(repo: Path) -> None:
    (repo / "src.ts").write_text("export const x = 1;\n")
    assert jk.check(repo, "never-snapshotted") is None


def test_state_lives_inside_the_git_directory(repo: Path) -> None:
    jk.snapshot(repo, SESSION)
    path = jk.state_file(repo, SESSION)
    assert path.is_file()
    assert (repo / ".git") in path.parents
