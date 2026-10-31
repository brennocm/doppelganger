import io
import json
import subprocess
from pathlib import Path

import findings as fd
import pytest

SESSION = "test-session"
# Built at run time so the repository's own gitleaks scan never sees a whole token.
FAKE_TOKEN = "ghp_" + "k3Jd9QwX7mZp2LrT" + "5vNb8YcF4hG6sA1eU0iO"
REAL_EMAIL = "jane.doe" + "@" + "gmail.com"
REAL_HOME = "/home/" + "jdoe" + "/notes"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)  # noqa: S603, S607


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "main")
    return tmp_path


@pytest.fixture
def state(repo: Path) -> Path:
    return fd.state_file(repo, SESSION)


def finding(n: int, hook: str = "secret-sentinel") -> fd.Finding:
    return fd.Finding(hook, "email", "src/a.ts", n, f"f{n:02d}…")


def run_main(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], repo: Path, *argv: str
) -> tuple[str, str]:
    monkeypatch.chdir(repo)
    event = {"session_id": SESSION, "hook_event_name": "PostFileSave"}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(event)))
    assert fd.main(list(argv)) == 0
    captured = capsys.readouterr()
    return captured.out, captured.err


@pytest.mark.parametrize(
    ("value", "masked"),
    [("someone@corp.test", "some…"), ("abcde", "abcd…"), ("abcd", "…"), ("ab", "…"), ("", "…")],
)
def test_mask_keeps_at_most_the_first_4_characters(value: str, masked: str) -> None:
    assert fd.mask(value) == masked


def test_raw_values_never_appear_in_any_output(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], repo: Path
) -> None:
    (repo / "leak.ts").write_text(
        f'const token = "{FAKE_TOKEN}";\nconst mail = "{REAL_EMAIL}";\nconst p = "{REAL_HOME}";\n'
    )
    scan_out, scan_err = run_main(monkeypatch, capsys, repo, "scan-secrets", "leak.ts")
    state_text = fd.state_file(repo, SESSION).read_text()
    deliver_out, deliver_err = run_main(monkeypatch, capsys, repo, "deliver")

    outputs = {
        "scan stdout": scan_out,
        "scan stderr": scan_err,
        "state file": state_text,
        "stop stdout": deliver_out,
        "stop stderr": deliver_err,
    }
    for raw in (FAKE_TOKEN, REAL_EMAIL, REAL_HOME, FAKE_TOKEN[4:], "jane.doe", "jdoe"):
        for name, text in outputs.items():
            assert raw not in text, f"{raw!r} leaked into {name}"

    reason = json.loads(deliver_out)["reason"]
    assert "secret (github-pat) in leak.ts:1: ghp_…" in reason
    assert "email in leak.ts:2: jane…" in reason
    assert "home-path in leak.ts:3: /hom…" in reason


def test_report_is_capped_at_50_findings(state: Path) -> None:
    fd.replace(state, "secret-sentinel", "src/a.ts", [finding(n) for n in range(60)])
    stored = json.loads(state.read_text())["groups"]
    assert sum(len(g["findings"]) for g in stored.values()) == fd.CAP
    reason = json.loads(fd.deliver(state) or "{}")["reason"]
    assert reason.count("\n- ") == fd.CAP
    assert reason.endswith("…and 10 more")


def test_cap_holds_across_hooks(state: Path) -> None:
    fd.replace(state, "secret-sentinel", "src/a.ts", [finding(n) for n in range(40)])
    tests = [finding(n, "test-affected") for n in range(20)]
    fd.replace(state, "test-affected", "packages/x", tests)
    stored = json.loads(state.read_text())["groups"]
    assert sum(len(g["findings"]) for g in stored.values()) == fd.CAP
    assert (fd.deliver(state) or "").endswith('…and 10 more"}')


def test_delivers_at_most_once_per_turn_then_clears(state: Path) -> None:
    fd.replace(state, "secret-sentinel", "src/a.ts", [finding(1)])
    first = fd.deliver(state)
    assert first is not None
    assert json.loads(first)["decision"] == "block"
    assert json.loads(state.read_text())["groups"] == {}

    # A finding during the follow-up turn waits: no second delivery, so no loop.
    fd.replace(state, "secret-sentinel", "src/b.ts", [finding(2)])
    assert fd.deliver(state) is None
    assert fd.deliver(state) is None

    fd.turn_start(state)
    second = json.loads(fd.deliver(state) or "{}")["reason"]
    assert "src/a.ts:2" in second
    assert "src/a.ts:1" not in second


def test_nothing_to_deliver_means_no_decision(state: Path) -> None:
    assert fd.deliver(state) is None  # no state file yet
    fd.turn_start(state)
    assert fd.deliver(state) is None  # empty report


def test_a_clean_rerun_clears_earlier_findings(state: Path) -> None:
    fd.replace(state, "test-affected", "packages/x", [finding(1, "test-affected")])
    fd.replace(state, "test-affected", "packages/x", [])
    assert fd.deliver(state) is None


def test_state_lives_inside_the_git_directory(repo: Path, state: Path) -> None:
    fd.turn_start(state)
    assert state.is_file()
    assert (repo / ".git") in state.parents
