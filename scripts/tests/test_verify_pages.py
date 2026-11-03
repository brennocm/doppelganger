"""scripts/verify-pages.mjs (project-foundation Requirement 5.4, design P39)."""

import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "verify-pages.mjs"
CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; "
    "connect-src 'self'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; "
    "object-src 'none'; base-uri 'none'; form-action 'none'"
)
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def _check(tmp_path: Path, body: str) -> subprocess.CompletedProcess[str]:
    page = f'<!doctype html><meta http-equiv="Content-Security-Policy" content="{CSP}">{body}'
    (tmp_path / "index.html").write_text(page, encoding="utf-8")
    return subprocess.run(  # noqa: S603
        ["node", str(SCRIPT), str(tmp_path)],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )


def test_https_navigation_links_are_allowed(tmp_path: Path) -> None:
    done = _check(tmp_path, '<a href="https://github.com/example/repo">Repository</a>')
    assert done.returncode == 0, done.stderr


@pytest.mark.parametrize(
    "body",
    [
        '<a href="http://example.com/">plain http</a>',
        '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
        '<img src="https://example.com/x.png" alt="">',
        '<script src="https://example.com/x.js"></script>',
        '<video poster="https://example.com/p.jpg"></video>',
        '<img srcset="https://example.com/a.png 1x" alt="">',
        '<a href="//example.com/x">protocol-relative</a>',
        '<area href="https://example.com/">',
    ],
)
def test_resource_loads_and_other_links_are_refused(tmp_path: Path, body: str) -> None:
    done = _check(tmp_path, body)
    assert done.returncode != 0
    assert "external origin" in done.stderr + done.stdout


def test_test_only_replay_signals_are_refused(tmp_path: Path) -> None:
    replay = tmp_path / "app" / "replay"
    replay.mkdir(parents=True)
    (replay / "clips.json").write_text('{"clips": []}', encoding="utf-8")
    assert _check(tmp_path, "<p>ok</p>").returncode == 0
    (replay / "test-signal-a.wav").write_bytes(b"RIFF")
    done = _check(tmp_path, "<p>ok</p>")
    assert done.returncode != 0
    assert "app/replay/test-signal-a.wav: test-only replay signal" in done.stderr
