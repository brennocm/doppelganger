"""Evaluation harness behind ``mise run model:eval`` (detection-model Requirement 2).

For every candidate, dataset and Codec_Condition: score every window, fit temperature
scaling on the dev split, and report EER, ROC AUC, the genuine false-alarm rate and the
synthetic detection rate at the possession threshold, plus ECE and ORT CPU latency.
Deterministic for the same inputs and models (Requirement 2.5).
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final, Protocol

import numpy as np

from model_lab import calibration, codecs, datasets, haunt_set, haunting, metrics, report
from model_lab.inference import OnnxModel
from model_lab.windows import frame

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

DEFAULT_MANIFEST_DIR: Final = Path("apps/web/public/models")
DEFAULT_REPORTS_DIR: Final = Path("packages/model-lab/reports")


class Candidate(Protocol):
    """A model under evaluation."""

    @property
    def id(self) -> str:
        """Model ID from the manifest."""

    @property
    def sha256(self) -> str:
        """SHA-256 of the evaluated model file."""

    @property
    def window_samples(self) -> int:
        """Window length in samples."""

    @property
    def hop_samples(self) -> int:
        """Hop length in samples."""

    @property
    def possession(self) -> float:
        """Possession threshold from the manifest."""

    @property
    def temperature(self) -> float:
        """Temperature stored in the manifest (used when there is no dev split)."""

    @property
    def haunting(self) -> haunting.HauntingConfig:
        """Detector defaults with the manifest's thresholds, for the smoothed rates."""

    def margin(self, window: codecs.Audio) -> float:
        """Spoof margin of one window."""


@dataclass(frozen=True)
class OnnxCandidate:
    """A verified ONNX model, evaluated exactly as the app and engine run it."""

    model: OnnxModel

    @property
    def id(self) -> str:  # noqa: D102
        return self.model.manifest.id

    @property
    def sha256(self) -> str:  # noqa: D102
        return self.model.manifest.sha256

    @property
    def window_samples(self) -> int:  # noqa: D102
        return self.model.manifest.windowSamples

    @property
    def hop_samples(self) -> int:  # noqa: D102
        return self.model.manifest.hopSamples

    @property
    def possession(self) -> float:  # noqa: D102
        return self.model.manifest.thresholds.possession

    @property
    def temperature(self) -> float:  # noqa: D102
        return self.model.manifest.calibration.temperature

    @property
    def haunting(self) -> haunting.HauntingConfig:  # noqa: D102
        t = self.model.manifest.thresholds
        return haunting.HauntingConfig(unease=t.unease, possession=t.possession, release=t.release)

    def margin(self, window: codecs.Audio) -> float:  # noqa: D102
        return self.model.margin(window)


@dataclass(frozen=True)
class ScoredItem:
    """Window margins of one item under one condition, in time order."""

    item: datasets.Item
    condition: str
    margins: list[float]


def item_windows(audio: codecs.Audio, window: int, hop: int) -> np.ndarray:
    """Full windows; a clip shorter than one window is zero-padded to one window."""
    if audio.shape[0] < window:
        return frame(codecs.fit_length(audio, window), window, hop)
    return frame(audio, window, hop)


def score_items(
    candidate: Candidate,
    items: Sequence[datasets.Item],
    source: Callable[[datasets.Item], codecs.Audio],
    conditions: Sequence[codecs.CodecCondition],
    timer: Callable[[], float] = time.perf_counter,
) -> tuple[list[ScoredItem], list[float]]:
    """Margins for every item and condition, and the per-window model latency in ms."""
    scored: list[ScoredItem] = []
    latency_ms: list[float] = []
    for item in items:
        audio = source(item)
        for condition in conditions:
            degraded = codecs.simulate(audio, condition, seed=datasets.item_seed(item))
            margins = []
            for window in item_windows(degraded, candidate.window_samples, candidate.hop_samples):
                start = timer()
                margins.append(candidate.margin(window))
                latency_ms.append((timer() - start) * 1000.0)
            scored.append(ScoredItem(item, condition.value, margins))
    return scored, latency_ms


def _arrays(scored: list[ScoredItem]) -> tuple[np.ndarray, np.ndarray]:
    margins = [m for s in scored for m in s.margins]
    labels = [s.item.label for s in scored for _ in s.margins]
    return np.asarray(margins, dtype=np.float64), np.asarray(labels, dtype=np.float64)


def fit_on_dev(scored: list[ScoredItem], fallback: float) -> tuple[float, str]:
    """Temperature fitted on dev windows (Requirement 4.1), or the manifest value."""
    margins, labels = _arrays([s for s in scored if s.item.split == "dev"])
    if margins.size == 0 or len(set(labels.tolist())) < 2:  # noqa: PLR2004
        return fallback, "manifest"
    return calibration.fit_temperature(margins, labels), "dev-split"


def _optional(value: float | None) -> float | None:
    return None if value is None else round(value, 6)


def smoothed_rates(
    group: Sequence[ScoredItem], temperature: float, cfg: haunting.HauntingConfig
) -> tuple[float | None, float | None]:
    """Share of genuine and of synthetic windows spent in Possession after replay."""
    possessed = {0: 0, 1: 0}
    total = {0: 0, 1: 0}
    for s in group:
        margins = calibration.calibrate_margins(s.margins, temperature).tolist()
        states = haunting.replay(margins, cfg)
        total[s.item.label] += len(states)
        possessed[s.item.label] += sum(1 for state in states if state == "possession")
    rate = {k: possessed[k] / total[k] if total[k] else None for k in total}
    return rate[0], rate[1]


def evaluate_candidate(
    candidate: Candidate,
    items: Sequence[datasets.Item],
    source: Callable[[datasets.Item], codecs.Audio],
    conditions: Sequence[codecs.CodecCondition],
    timer: Callable[[], float] = time.perf_counter,
) -> dict[str, object]:
    """Results of one candidate on every dataset and condition."""
    scored, latency_ms = score_items(candidate, items, source, conditions, timer)
    temperature, origin = fit_on_dev(scored, candidate.temperature)
    groups: dict[tuple[str, str], list[ScoredItem]] = defaultdict(list)
    for s in scored:
        if s.item.split == "eval":
            groups[(s.item.dataset, s.condition)].append(s)
    rows = []
    for (dataset, condition), group in sorted(groups.items()):
        margins, labels = _arrays(group)
        raw = calibration.calibrate_margins(margins, 1.0)
        calibrated = calibration.calibrate_margins(margins, temperature)
        m = metrics.compute(labels, calibrated, candidate.possession)
        fa_smoothed, detected_smoothed = smoothed_rates(group, temperature, candidate.haunting)
        rows.append(
            {
                "dataset": dataset,
                "condition": condition,
                "split": "eval",
                "genuine": m.genuine,
                "synthetic": m.synthetic,
                "auc": _optional(m.auc),
                "eer": _optional(m.eer),
                "falseAlarmRate": _optional(m.false_alarm_rate),
                "detectionRate": _optional(m.detection_rate),
                "falseAlarmRateSmoothed": _optional(fa_smoothed),
                "detectionRateSmoothed": _optional(detected_smoothed),
                "eceBefore": _optional(calibration.expected_calibration_error(raw, labels)),
                "eceAfter": _optional(calibration.expected_calibration_error(calibrated, labels)),
            }
        )
    return {
        "candidate": candidate.id,
        "modelSha256": candidate.sha256,
        "possessionThreshold": candidate.possession,
        "calibration": {"method": "temperature", "temperature": round(temperature, 6),
                        "fittedOn": origin},
        "latencyMs": {
            "runtime": "onnxruntime-cpu-1-thread",
            "windows": len(latency_ms),
            "p50": _optional(metrics.percentile(latency_ms, 50)),
            "p95": _optional(metrics.percentile(latency_ms, 95)),
        },
        "results": rows,
    }  # fmt: skip


def evaluate(
    candidates: Sequence[Candidate],
    items: Sequence[datasets.Item],
    source: Callable[[datasets.Item], codecs.Audio],
    conditions: Sequence[codecs.CodecCondition] = tuple(codecs.CodecCondition),
    timer: Callable[[], float] = time.perf_counter,
) -> dict[str, object]:
    """Evaluate every candidate; the result is what results.json contains."""
    return {
        "conditions": [c.value for c in conditions],
        "datasets": sorted({i.dataset for i in items}),
        "items": {
            "dev": sum(1 for i in items if i.split == "dev"),
            "eval": sum(1 for i in items if i.split == "eval"),
        },
        "candidates": [evaluate_candidate(c, items, source, conditions, timer) for c in candidates],
    }


#: Every report of the synthetic dataset carries this label (design P31).
DRY_RUN_LABEL: Final = "synthetic dry run, not a measurement"
#: packages/model-lab/reports, found from this file so the check does not depend on the cwd.
_COMMITTED_REPORTS: Final = Path(__file__).resolve().parents[2] / "reports"


class DryRunError(ValueError):
    """A synthetic dry run was asked to do something that could pass for a measurement."""


def dry_run_reports(names: list[str], reports: Path | None, label: str) -> tuple[Path, str]:
    """The reports folder and label of a run; strict for the synthetic dataset (P31, P33)."""
    if datasets.SYNTHETIC not in names:
        return reports or DEFAULT_REPORTS_DIR, label
    if names != [datasets.SYNTHETIC]:
        msg = "the synthetic dataset cannot be combined with other datasets"
        raise DryRunError(msg)
    if reports is None:
        msg = "--reports is required with the synthetic dataset, outside packages/model-lab/reports"
        raise DryRunError(msg)
    target = reports.resolve()
    for committed in {_COMMITTED_REPORTS, DEFAULT_REPORTS_DIR.resolve()}:
        if target.is_relative_to(committed):
            msg = "a synthetic dry run must not write into packages/model-lab/reports"
            raise DryRunError(msg)
    return reports, DRY_RUN_LABEL + (f"; {label}" if label else "")


def _load_items(
    names: list[str], limit: int | None
) -> tuple[list[datasets.Item], Callable[[datasets.Item], codecs.Audio], list[Path]]:
    if names == [datasets.SYNTHETIC]:
        return datasets.synthetic_items(), datasets.synthetic_source, []
    items: list[datasets.Item] = []
    roots: dict[str, Path] = {}
    if datasets.HAUNT_SET in names:
        root = haunt_set.dataset_dir()
        roots[datasets.HAUNT_SET] = root
        items += datasets.haunt_set_items(haunt_set.load_index(root))
    if datasets.ASVSPOOF_2019_LA in names:
        root = datasets.asvspoof_root(haunt_set.dataset_dir(datasets.BENCHMARK_ENV))
        roots[datasets.ASVSPOOF_2019_LA] = root
        items += datasets.subsample(datasets.load_asvspoof(root), limit)
    return items, datasets.file_source(roots), list(roots.values())


def main(argv: list[str] | None = None) -> int:
    """CLI entry point used by ``mise run model:eval``."""
    parser = argparse.ArgumentParser(prog="model_lab.evaluate", description=__doc__)
    parser.add_argument("--manifest", type=Path, action="append", default=[])
    parser.add_argument("--manifest-dir", type=Path, default=DEFAULT_MANIFEST_DIR)
    parser.add_argument("--datasets", default=f"{datasets.HAUNT_SET},{datasets.ASVSPOOF_2019_LA}")
    parser.add_argument("--benchmark-limit", type=int, default=None)
    parser.add_argument("--reports", type=Path, default=None, help=f"default {DEFAULT_REPORTS_DIR}")
    parser.add_argument("--web-latency", type=Path, default=None)
    parser.add_argument("--label", default="")
    args = parser.parse_args(argv)
    manifests = args.manifest or sorted(args.manifest_dir.glob("*.json"))
    names = args.datasets.split(",")
    try:
        reports_dir, label = dry_run_reports(names, args.reports, args.label)
        items, source, forbidden = _load_items(names, args.benchmark_limit)
    except (haunt_set.DatasetError, DryRunError) as error:
        sys.stderr.write(f"model:eval: {error}\n")
        return 2
    candidates = [OnnxCandidate(OnnxModel.from_manifest_file(p)) for p in manifests]
    results = evaluate(candidates, items, source)
    if args.web_latency is not None:
        results["webLatency"] = report.read_web_latency(args.web_latency)
    today = dt.datetime.now(dt.UTC).date()
    folder = report.write(results, reports_dir, today, label, forbidden=forbidden)
    sys.stdout.write(f"model:eval: wrote {folder}/results.json and summary.md\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
