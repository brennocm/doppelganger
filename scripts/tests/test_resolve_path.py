import json
import subprocess
from pathlib import Path

import pytest

HELPER = Path(__file__).resolve().parents[1] / "hooks" / "resolve-path.sh"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)  # noqa: S603, S607


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "packages").mkdir()
    return tmp_path


def hook_path(repo: Path, arg: str | None, event: dict[str, object] | None) -> tuple[int, str]:
    script = f'source "{HELPER}"; hook_path "$@"'
    args = ["bash", "-c", script, "hook_path", *([arg] if arg is not None else [])]
    stdin = json.dumps(event) if event is not None else ""
    result = subprocess.run(  # noqa: S603  (fixed test command)
        args, cwd=repo, input=stdin, capture_output=True, text=True, check=False
    )
    return result.returncode, result.stdout.strip()


def test_reads_the_path_from_the_event_on_stdin(repo: Path) -> None:
    event = {"hook_event_name": "PostFileSave", "file_path": str(repo / "packages/a.ts")}
    assert hook_path(repo, None, event) == (0, "packages/a.ts")


def test_ignores_an_unfilled_placeholder_argument(repo: Path) -> None:
    # The Kiro CLI V3 passes {{filePath}} through unchanged; the event must win.
    event = {"hook_event_name": "PostFileSave", "file_path": str(repo / "packages/a.ts")}
    assert hook_path(repo, "{{filePath}}", event) == (0, "packages/a.ts")


def test_unfilled_placeholder_without_an_event_is_no_path(repo: Path) -> None:
    code, out = hook_path(repo, "{{filePath}}", None)
    assert code != 0
    assert out == ""


def test_a_real_argument_is_used_for_manual_runs(repo: Path) -> None:
    assert hook_path(repo, str(repo / "packages/b.py"), None) == (0, "packages/b.py")
