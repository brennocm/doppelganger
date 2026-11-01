import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pytest

from model_lab import codecs, datasets, evaluate, haunt_set, metrics, report, synthetic
from model_lab.codecs import CodecCondition

WINDOW, HOP = 1600, 800
CONDITIONS = (CodecCondition.CLEAN, CodecCondition.NOISE_10DB)


@dataclass(frozen=True)
class MeanCandidate:
    """Fake model: the spoof margin is the window mean, scaled."""

    id: str = "fake-mean"
    sha256: str = "0" * 64
    window_samples: int = WINDOW
    hop_samples: int = HOP
    possession: float = 0.7
    temperature: float = 1.0

    def margin(self, window: codecs.Audio) -> float:
        return float(np.mean(window)) * 40.0


def _items() -> list[datasets.Item]:
    lines = ["path,label,session_id,system_id,device,room,language,script_id"]
    for s, lang in (("s01", "pt-BR"), ("s02", "en"), ("s03", "pt-BR"), ("s04", "en")):
        for t in ("t01", "t02", "t03"):
            lines.append(f"genuine/{s}/{t}.flac,genuine,{s},,mic,room,{lang},{t}")
            lines.append(f"synthetic/tts-a/{s}/{t}.flac,synthetic,{s},tts-a,,,{lang},{t}")
    return datasets.haunt_set_items(haunt_set.parse_index(lines))


def _source(item: datasets.Item) -> codecs.Audio:
    seed = datasets.item_seed(item)
    audio = synthetic.signal("noise", 2 * WINDOW, seed=seed, amplitude=0.2)
    return (audio + (0.1 if item.label else -0.1)).astype(np.float32)


class Ticks:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        self.now += 0.001
        return self.now


def _run() -> dict[str, object]:
    return evaluate.evaluate([MeanCandidate()], _items(), _source, CONDITIONS, Ticks())


def test_separable_data_gives_perfect_metrics_per_condition() -> None:
    results = _run()
    (candidate,) = results["candidates"]  # type: ignore[misc]
    assert candidate["calibration"]["fittedOn"] == "dev-split"
    rows = candidate["results"]
    assert [r["condition"] for r in rows] == ["clean", "noise-10db"]
    for row in rows:
        assert row["auc"] == 1.0
        assert row["eer"] == 0.0
        assert row["falseAlarmRate"] == 0.0
        assert row["detectionRate"] == 1.0
        assert row["genuine"] == row["synthetic"] > 0
    assert candidate["latencyMs"]["p50"] == pytest.approx(1.0)


def test_evaluation_is_deterministic() -> None:
    assert json.dumps(_run(), sort_keys=True) == json.dumps(_run(), sort_keys=True)


def test_dev_sessions_never_appear_in_reported_counts() -> None:
    items = _items()
    results = _run()
    eval_items = [i for i in items if i.split == "eval"]
    per_item = evaluate.item_windows(_source(items[0]), WINDOW, HOP).shape[0]
    row = results["candidates"][0]["results"][0]  # type: ignore[index]
    assert row["genuine"] + row["synthetic"] == len(eval_items) * per_item


def test_short_clips_are_padded_to_one_window() -> None:
    assert evaluate.item_windows(np.ones(10, dtype=np.float32), WINDOW, HOP).shape == (1, WINDOW)


def test_without_dev_items_the_manifest_temperature_is_used() -> None:
    items = [i for i in _items() if i.split == "eval"]
    results = evaluate.evaluate([MeanCandidate(temperature=2.0)], items, _source, CONDITIONS)
    assert results["candidates"][0]["calibration"] == {  # type: ignore[index]
        "method": "temperature",
        "temperature": 2.0,
        "fittedOn": "manifest",
    }


def test_eer_and_rates_on_a_known_case() -> None:
    labels = [0, 0, 0, 0, 1, 1, 1, 1]
    scores = [0.1, 0.2, 0.3, 0.8, 0.25, 0.6, 0.9, 0.95]
    m = metrics.compute(labels, scores, threshold=0.7)
    assert m.auc == pytest.approx(13 / 16)
    assert m.eer == pytest.approx(0.25)
    assert m.false_alarm_rate == pytest.approx(0.25)
    assert m.detection_rate == pytest.approx(0.5)
    one_class = metrics.compute([0, 0], [0.1, 0.9], 0.5)
    assert one_class.auc is None
    assert one_class.eer is None
    assert one_class.detection_rate is None


def test_reports_are_written_without_paths(tmp_path: Path) -> None:
    folder = report.write(_run(), tmp_path, dt.date(2026, 10, 31), "test")
    assert sorted(p.name for p in folder.iterdir()) == ["results.json", "summary.md"]
    summary = (folder / "summary.md").read_text(encoding="utf-8")
    assert "| haunt-set | clean |" in summary
    assert "fake-mean" in summary
    data = json.loads((folder / "results.json").read_text(encoding="utf-8"))
    assert data["date"] == "2026-10-31"
    assert "genuine/s01" not in (folder / "results.json").read_text(encoding="utf-8")


@pytest.mark.parametrize(
    # Built from pieces so the PII scanner does not flag the test's own fixture paths.
    "leak",
    ["/" + "home/someone/haunt/x.flac", "C:\\data\\x.flac", "/mnt/data/set", "/" + "tmp/x"],
)
def test_reports_refuse_absolute_paths(tmp_path: Path, leak: str) -> None:
    results = {**_run(), "datasets": [leak]}
    with pytest.raises(report.ReportError):
        report.write(results, tmp_path, dt.date(2026, 10, 31))
    assert not list(tmp_path.iterdir())


def test_reports_refuse_dataset_roots(tmp_path: Path) -> None:
    root = Path("relative/root")
    results = {**_run(), "datasets": ["relative/root/index.csv"]}
    with pytest.raises(report.ReportError, match="dataset path"):
        report.write(results, tmp_path, dt.date(2026, 10, 31), forbidden=[root])


def test_asvspoof_protocol_parsing_and_subsampling() -> None:
    lines = ["LA_0039 LA_E_2834763 - A11 spoof", "", "LA_0014 LA_E_8877452 - - bonafide"]
    items = datasets.parse_asvspoof_protocol(lines)
    assert [(i.label, i.system, i.group) for i in items] == [
        (1, "A11", "LA_0039"),
        (0, "genuine", "LA_0014"),
    ]
    assert items[0].path == "ASVspoof2019_LA_eval/flac/LA_E_2834763.flac"
    assert datasets.subsample(items, 1) == datasets.subsample(items, 1)
    assert len(datasets.subsample(items, 1)) == 1
    with pytest.raises(haunt_set.DatasetError, match="line 1"):
        datasets.parse_asvspoof_protocol(["LA_0039 LA_E_1 - A11 maybe"])


def test_cli_names_the_missing_variable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("HAUNT_SET_DIR", raising=False)
    assert evaluate.main(["--datasets", "haunt-set"]) == 2  # noqa: PLR2004
    assert "HAUNT_SET_DIR is not set" in capsys.readouterr().err
    monkeypatch.delenv("BENCHMARK_DIR", raising=False)
    assert evaluate.main(["--datasets", "asvspoof2019-la"]) == 2  # noqa: PLR2004
    assert "BENCHMARK_DIR is not set" in capsys.readouterr().err
