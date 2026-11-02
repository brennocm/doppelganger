"""Synthetic dry run of the evaluation harness (detection-model design P31, P33).

Every signal is generated from a seed; nothing is read from or written to the repository.
"""

import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from model_lab import codecs, datasets, evaluate, haunt_set, synthetic

REPO = Path(__file__).resolve().parents[3]
CI_MANIFEST = REPO / "apps/web/public/models/ci-synthetic-linear.json"
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def test_items_have_both_labels_in_dev_and_eval_and_every_signal_kind() -> None:
    items = datasets.synthetic_items()
    assert len(items) == 8  # noqa: PLR2004
    for split in ("dev", "eval"):
        assert {i.label for i in items if i.split == split} == {0, 1}
    groups = {split: {i.group for i in items if i.split == split} for split in ("dev", "eval")}
    assert groups["dev"].isdisjoint(groups["eval"])
    assert {i.path.rsplit("/", 1)[-1].split("-")[0] for i in items} == set(synthetic.KINDS)
    assert {i.dataset for i in items} == {datasets.SYNTHETIC}


def test_source_is_seeded_finite_and_six_seconds_long() -> None:
    for item in datasets.synthetic_items():
        audio = datasets.synthetic_source(item)
        assert audio.dtype == np.float32
        assert audio.shape == (datasets.SYNTHETIC_SECONDS * codecs.SAMPLE_RATE,)
        assert np.all(np.isfinite(audio))
        assert np.max(np.abs(audio)) <= 1.0
        np.testing.assert_array_equal(audio, datasets.synthetic_source(item))


def test_source_refuses_items_of_other_datasets() -> None:
    item = datasets.Item(datasets.HAUNT_SET, "s1/noise-0", 0, "s1", "genuine", "eval")
    with pytest.raises(haunt_set.DatasetError, match="not a synthetic item"):
        datasets.synthetic_source(item)


def test_real_datasets_keep_the_default_reports_folder_and_label() -> None:
    names = [datasets.HAUNT_SET]
    assert evaluate.dry_run_reports(names, None, "x") == (evaluate.DEFAULT_REPORTS_DIR, "x")


def test_dry_run_requires_reports_and_always_carries_its_label(tmp_path: Path) -> None:
    with pytest.raises(evaluate.DryRunError, match="--reports is required"):
        evaluate.dry_run_reports([datasets.SYNTHETIC], None, "")
    folder, label = evaluate.dry_run_reports([datasets.SYNTHETIC], tmp_path, "")
    assert (folder, label) == (tmp_path, evaluate.DRY_RUN_LABEL)
    _, label = evaluate.dry_run_reports([datasets.SYNTHETIC], tmp_path, "aasist-l")
    assert label == f"{evaluate.DRY_RUN_LABEL}; aasist-l"


@pytest.mark.parametrize(
    "reports",
    [
        evaluate.DEFAULT_REPORTS_DIR,
        evaluate.DEFAULT_REPORTS_DIR / "dry",
        REPO / "packages/model-lab/reports",
        REPO / "packages/model-lab/reports/../reports/x",
    ],
)
def test_dry_run_refuses_the_committed_reports_folder(reports: Path) -> None:
    with pytest.raises(evaluate.DryRunError, match="must not write into"):
        evaluate.dry_run_reports([datasets.SYNTHETIC], reports, "")


def test_dry_run_cannot_be_mixed_with_real_datasets(tmp_path: Path) -> None:
    with pytest.raises(evaluate.DryRunError, match="cannot be combined"):
        evaluate.dry_run_reports([datasets.SYNTHETIC, datasets.HAUNT_SET], tmp_path, "")


def test_cli_refuses_a_dry_run_without_reports(capsys: pytest.CaptureFixture[str]) -> None:
    assert evaluate.main(["--datasets", "synthetic", "--manifest", str(CI_MANIFEST)]) == 2  # noqa: PLR2004
    assert "--reports is required" in capsys.readouterr().err


@needs_ffmpeg
def test_cli_dry_run_covers_every_condition_and_is_labelled(tmp_path: Path) -> None:
    argv = ["--datasets", "synthetic", "--manifest", str(CI_MANIFEST), "--reports", str(tmp_path)]
    assert evaluate.main(argv) == 0
    (folder,) = tmp_path.iterdir()
    results = json.loads((folder / "results.json").read_text(encoding="utf-8"))
    assert results["label"] == evaluate.DRY_RUN_LABEL
    assert results["datasets"] == [datasets.SYNTHETIC]
    assert results["items"] == {"dev": 4, "eval": 4}
    assert results["conditions"] == [c.value for c in codecs.CodecCondition]
    (candidate,) = results["candidates"]
    assert candidate["calibration"]["fittedOn"] == "dev-split"
    assert {r["condition"] for r in candidate["results"]} == set(results["conditions"])
    assert evaluate.DRY_RUN_LABEL in (folder / "summary.md").read_text(encoding="utf-8")
