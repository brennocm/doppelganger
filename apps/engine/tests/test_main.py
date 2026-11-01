import json
import shutil
from pathlib import Path

import pytest

from doppelganger_engine import __main__ as entry

REPO = Path(__file__).resolve().parents[3]
MODELS = REPO / "apps/web/public/models"
CONFIG_ERROR = 2


def test_exits_1_when_the_model_fails_its_hash_check(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    shutil.copy(MODELS / "ci-synthetic-linear.json", tmp_path)
    tampered = bytearray((MODELS / "ci-synthetic-linear.int8.onnx").read_bytes())
    tampered[100] ^= 0xFF
    (tmp_path / "ci-synthetic-linear.int8.onnx").write_bytes(bytes(tampered))
    monkeypatch.setattr(
        entry.os, "environ", {"MODEL_DIR": str(tmp_path), "MODEL_ID": "ci-synthetic-linear"}
    )
    assert entry.main() == 1
    out = capsys.readouterr().out
    assert json.loads(out.strip())["event"] == "model_integrity_failed"
    assert "token" not in out


def test_exits_2_with_the_variable_name_on_bad_config(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        entry.os,
        "environ",
        {"MODEL_DIR": str(MODELS), "MODEL_ID": "ci-synthetic-linear", "PORT": "99999"},
    )
    assert entry.main() == CONFIG_ERROR
    assert "PORT:" in capsys.readouterr().err
