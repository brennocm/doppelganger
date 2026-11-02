"""Fine-tuning fallback (detection-model task 4.2, design P34).

CPU only, random init and synthetic data: nothing is downloaded and nothing real is trained.
"""

import datetime as dt
import json
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from model_lab import codecs, datasets, finetune, synthetic

COMMITTED = Path(__file__).resolve().parents[1] / "configs" / "finetune-aasist-l.json"
TODAY = dt.date(2026, 11, 2)
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def _smoke(**overrides: Any) -> dict[str, Any]:  # noqa: ANN401
    data = json.loads(COMMITTED.read_text(encoding="utf-8"))
    data.update(
        init="random",
        dataset="synthetic",
        epochs=1,
        batchSize=2,
        maxItemsPerEpoch=4,
        conditions=["clean", "noise-10db"],
        exportOnnx=False,
    )
    data.update(overrides)
    return data


def _run(tmp: Path, **overrides: Any) -> dict[str, object]:  # noqa: ANN401
    cfg = finetune.parse_config(_smoke(**overrides))
    items, source = finetune.training_data(cfg)
    return finetune.run(cfg, tmp, items, source, TODAY)


def test_the_committed_config_is_valid_and_never_uses_the_haunt_set() -> None:
    cfg = finetune.parse_config(json.loads(COMMITTED.read_text(encoding="utf-8")))
    assert cfg.dataset == datasets.ASVSPOOF_2019_LA_TRAIN
    assert cfg.init == "pretrained"
    assert cfg.class_weights == (0.1, 0.9)
    assert set(cfg.conditions) == set(codecs.CodecCondition)
    assert datasets.HAUNT_SET not in finetune.DATASETS


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"candidate": "rawnet2"}, "candidate"),
        ({"dataset": "haunt-set"}, "dataset"),
        ({"init": "imagenet"}, "init"),
        ({"epochs": 0}, "epochs"),
        ({"batchSize": True}, "batchSize"),
        ({"learningRate": float("nan")}, "learningRate"),
        ({"learningRate": float("inf")}, "learningRate"),
        ({"weightDecay": -1.0}, "weightDecay"),
        ({"classWeights": [1.0]}, "classWeights"),
        ({"classWeights": [0.0, 1.0]}, "finite positive"),
        ({"conditions": []}, "conditions"),
        ({"conditions": ["clean", "clean"]}, "conditions"),
        ({"conditions": ["mp3"]}, "conditions"),
        ({"maxItemsPerEpoch": 0}, "maxItemsPerEpoch"),
        ({"modelId": "../evil"}, "modelId"),
        ({"extra": 1}, "unknown keys"),
    ],
)
def test_bad_configs_are_refused(override: dict[str, Any], message: str) -> None:
    with pytest.raises(finetune.FinetuneError, match=message):
        finetune.parse_config(_smoke(**override))


def test_missing_keys_and_non_objects_are_refused() -> None:
    data = _smoke()
    del data["seed"]
    with pytest.raises(finetune.FinetuneError, match="missing keys"):
        finetune.parse_config(data)
    with pytest.raises(finetune.FinetuneError, match="JSON object"):
        finetune.parse_config([])


@pytest.mark.parametrize(
    "out", [finetune.REPO_ROOT, finetune.REPO_ROOT / "packages/model-lab/runs", Path("runs")]
)
def test_outputs_inside_the_repository_are_refused(out: Path) -> None:
    # Relative paths resolve against the cwd, which is the repository root under mise.
    if not out.is_absolute() and not Path.cwd().resolve().is_relative_to(finetune.REPO_ROOT):
        pytest.skip("cwd is outside the repository")
    with pytest.raises(finetune.FinetuneError, match="outside the repository"):
        finetune.check_out_dir(out)


def test_examples_are_one_window_in_range_and_seeded() -> None:
    audio = synthetic.signal("chirp", 70_000, seed=3)
    conditions = (codecs.CodecCondition.CLEAN, codecs.CodecCondition.NOISE_10DB)
    a = finetune.example(audio, np.random.default_rng(7), conditions)
    b = finetune.example(audio, np.random.default_rng(7), conditions)
    assert a.shape == (finetune.candidates.WINDOW,)
    assert a.dtype == np.float32
    assert np.max(np.abs(a)) <= 1.0
    np.testing.assert_array_equal(a, b)
    short = finetune.example(np.zeros(10, dtype=np.float32), np.random.default_rng(1), conditions)
    assert short.shape == (finetune.candidates.WINDOW,)


def test_epoch_order_is_a_seeded_permutation_cut_to_the_limit() -> None:
    assert sorted(finetune.epoch_order(8, 1, 0, None)) == list(range(8))
    assert finetune.epoch_order(8, 1, 0, 3) == finetune.epoch_order(8, 1, 0, None)[:3]
    assert finetune.epoch_order(8, 1, 0, None) != finetune.epoch_order(8, 1, 1, None)
    assert finetune.epoch_order(0, 1, 0, None) == []


def test_smoke_run_on_cpu_is_reproducible(tmp_path: Path) -> None:
    first = _run(tmp_path / "a")
    second = _run(tmp_path / "b")
    assert first["epochLoss"] == second["epochLoss"]
    assert first["modelSha256"] == second["modelSha256"]
    losses = first["epochLoss"]
    assert isinstance(losses, list)
    assert len(losses) == 1
    assert np.isfinite(losses[0])
    assert first["startCheckpointSha256"] is None
    assert sorted(p.name for p in (tmp_path / "a").iterdir()) == ["model.pth", "run.json"]
    record = json.loads((tmp_path / "a" / "run.json").read_text(encoding="utf-8"))
    assert record["config"]["seed"] == 1234  # noqa: PLR2004
    assert record["config"]["conditions"] == ["clean", "noise-10db"]


def test_a_different_seed_changes_the_weights(tmp_path: Path) -> None:
    assert _run(tmp_path / "a")["modelSha256"] != _run(tmp_path / "b", seed=99)["modelSha256"]


@needs_ffmpeg
def test_smoke_run_with_every_codec_condition(tmp_path: Path) -> None:
    conditions = [c.value for c in codecs.CodecCondition]
    record = _run(tmp_path, conditions=conditions, maxItemsPerEpoch=2)
    losses = record["epochLoss"]
    assert isinstance(losses, list)
    assert np.isfinite(losses[0])


def test_cli_refuses_an_output_inside_the_repository(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = tmp_path / "smoke.json"
    config.write_text(json.dumps(_smoke()), encoding="utf-8")
    out = finetune.REPO_ROOT / "packages/model-lab/runs"
    assert finetune.main(["--config", str(config), "--out", str(out)]) == 2  # noqa: PLR2004
    assert "outside the repository" in capsys.readouterr().err
    assert not out.exists()


def test_cli_names_the_missing_training_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("BENCHMARK_DIR", raising=False)
    config = tmp_path / "real.json"
    config.write_text(json.dumps(_smoke(dataset="asvspoof2019-la-train")), encoding="utf-8")
    assert finetune.main(["--config", str(config), "--out", str(tmp_path / "o")]) == 2  # noqa: PLR2004
    assert "BENCHMARK_DIR is not set" in capsys.readouterr().err


def test_train_protocol_items_are_never_dev_or_eval() -> None:
    items = datasets.parse_asvspoof_protocol(["LA_0079 LA_T_1138215 - - bonafide"], "train")
    assert items[0].dataset == datasets.ASVSPOOF_2019_LA_TRAIN
    assert items[0].split == "train"
    assert items[0].path == "ASVspoof2019_LA_train/flac/LA_T_1138215.flac"
