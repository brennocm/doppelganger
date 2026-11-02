"""Codec-augmented fine-tuning of an AASIST candidate (detection-model task 4.2, design P34).

Prepared ahead of the gate and run only if it fails (Requirement 3.2). Every random choice
comes from the config's seed. Audio is decoded in memory and never written; the outputs are
weights, a run record and, optionally, an fp32 ONNX model with its manifest.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final, Literal

import numpy as np
import torch

from model_lab import candidates, codecs, datasets, export, haunt_set

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

#: packages/model-lab/src/model_lab/finetune.py -> the repository root.
REPO_ROOT: Final = Path(__file__).resolve().parents[4]
DATASETS: Final = (datasets.ASVSPOOF_2019_LA_TRAIN, datasets.SYNTHETIC)
_MODEL_ID: Final = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
_FIELDS: Final = {
    "candidate": "candidate",
    "init": "init",
    "dataset": "dataset",
    "seed": "seed",
    "epochs": "epochs",
    "batchSize": "batch_size",
    "learningRate": "learning_rate",
    "weightDecay": "weight_decay",
    "classWeights": "class_weights",
    "conditions": "conditions",
    "maxItemsPerEpoch": "max_items_per_epoch",
    "exportOnnx": "export_onnx",
    "modelId": "model_id",
}


class FinetuneError(ValueError):
    """The config or the output folder is not acceptable."""


@dataclass(frozen=True)
class FinetuneConfig:
    """A validated fine-tuning config (design P34)."""

    candidate: str
    init: Literal["pretrained", "random"]
    dataset: str
    seed: int
    epochs: int
    batch_size: int
    learning_rate: float
    weight_decay: float
    #: Upstream index order: spoof (0), then bona fide (1).
    class_weights: tuple[float, float]
    conditions: tuple[codecs.CodecCondition, ...]
    max_items_per_epoch: int | None
    export_onnx: bool
    model_id: str


def _require(ok: bool, message: str) -> None:  # noqa: FBT001
    """Raise a FinetuneError naming the config problem unless ok."""
    if not ok:
        msg = f"finetune config: {message}"
        raise FinetuneError(msg)


def _positive_int(value: object, key: str) -> int:
    ok = isinstance(value, int) and not isinstance(value, bool) and value >= 1
    _require(ok, f"{key} must be a positive integer")
    assert isinstance(value, int)  # noqa: S101  (narrowing after _require)
    return value


def _positive_float(value: object, key: str, *, zero_ok: bool = False) -> float:
    number = float("nan")
    if isinstance(value, int | float) and not isinstance(value, bool):
        number = float(value)
    ok = bool(np.isfinite(number)) and (number > 0 or (zero_ok and number == 0))
    _require(ok, f"{key} must be a finite {'non-negative' if zero_ok else 'positive'} number")
    return number


def _conditions(value: object) -> tuple[codecs.CodecCondition, ...]:
    known = {c.value for c in codecs.CodecCondition}
    raw = value if isinstance(value, list) else []
    names = [v for v in raw if isinstance(v, str)]
    ok = bool(names) and len(names) == len(raw) and len(set(names)) == len(names)
    ok = ok and set(names) <= known
    _require(ok, f"conditions must be a non-empty list of distinct values from {sorted(known)}")
    return tuple(codecs.CodecCondition(c) for c in names)


def parse_config(data: object) -> FinetuneConfig:
    """Validate a decoded JSON config; unknown or missing keys are refused."""
    _require(isinstance(data, dict), "must be a JSON object")
    assert isinstance(data, dict)  # noqa: S101  (narrowing after _require)
    unknown, missing = sorted(set(data) - set(_FIELDS)), sorted(set(_FIELDS) - set(data))
    _require(not unknown and not missing, f"unknown keys {unknown}, missing keys {missing}")
    _require(data["candidate"] in candidates.NAMES, f"candidate must be one of {candidates.NAMES}")
    _require(data["init"] in ("pretrained", "random"), "init must be 'pretrained' or 'random'")
    _require(data["dataset"] in DATASETS, f"dataset must be one of {list(DATASETS)}")
    weights = data["classWeights"]
    pair_ok = isinstance(weights, list) and len(weights) == 2  # noqa: PLR2004
    _require(pair_ok, "classWeights must be [spoof, bona fide]")
    spoof, bona_fide = (_positive_float(w, "classWeights") for w in weights)
    model_id = data["modelId"]
    _require(isinstance(model_id, str) and _MODEL_ID.fullmatch(model_id) is not None,
             "modelId must be lowercase letters, digits and dashes")  # fmt: skip
    _require(isinstance(data["exportOnnx"], bool), "exportOnnx must be a boolean")
    seed = data["seed"]
    _require(isinstance(seed, int) and not isinstance(seed, bool), "seed must be an integer")
    limit = data["maxItemsPerEpoch"]
    return FinetuneConfig(
        candidate=data["candidate"],
        init=data["init"],
        dataset=data["dataset"],
        seed=seed,
        epochs=_positive_int(data["epochs"], "epochs"),
        batch_size=_positive_int(data["batchSize"], "batchSize"),
        learning_rate=_positive_float(data["learningRate"], "learningRate"),
        weight_decay=_positive_float(data["weightDecay"], "weightDecay", zero_ok=True),
        class_weights=(spoof, bona_fide),
        conditions=_conditions(data["conditions"]),
        max_items_per_epoch=None if limit is None else _positive_int(limit, "maxItemsPerEpoch"),
        export_onnx=data["exportOnnx"],
        model_id=model_id,
    )


def training_data(
    cfg: FinetuneConfig,
) -> tuple[list[datasets.Item], Callable[[datasets.Item], codecs.Audio]]:
    """Items and their in-memory audio source; the Haunt_Set is never a training set."""
    if cfg.dataset == datasets.SYNTHETIC:
        return datasets.synthetic_items(), datasets.synthetic_source
    root = datasets.asvspoof_train_root(haunt_set.dataset_dir(datasets.BENCHMARK_ENV))
    items = datasets.load_asvspoof_train(root)
    return items, datasets.file_source({datasets.ASVSPOOF_2019_LA_TRAIN: root})


def example(
    audio: codecs.Audio,
    rng: np.random.Generator,
    conditions: Sequence[codecs.CodecCondition],
    window: int = candidates.WINDOW,
) -> codecs.Audio:
    """A random crop of one window, degraded by one randomly drawn Codec_Condition."""
    condition = conditions[int(rng.integers(len(conditions)))]
    start = int(rng.integers(0, max(1, audio.shape[0] - window + 1)))
    crop = codecs.fit_length(audio[start : start + window], window)
    return codecs.simulate(crop, condition, seed=int(rng.integers(2**31)))


def epoch_order(count: int, seed: int, epoch: int, limit: int | None) -> list[int]:
    """Seeded item order for one epoch, cut to at most `limit` items."""
    order: list[int] = np.random.default_rng([seed, epoch]).permutation(count).tolist()
    return order if limit is None else order[:limit]


def initial_model(cfg: FinetuneConfig) -> tuple[candidates.LogitsOnly, str | None]:
    """The starting model and the SHA-256 of its checkpoint (None for random init)."""
    if cfg.init == "random":
        return candidates.LogitsOnly(candidates.build(cfg.candidate)), None
    path = candidates.fetch(cfg.candidate)
    return candidates.load(cfg.candidate, path), candidates.sha256_file(path)


def train(
    cfg: FinetuneConfig,
    model: candidates.LogitsOnly,
    items: Sequence[datasets.Item],
    source: Callable[[datasets.Item], codecs.Audio],
) -> list[float]:
    """Fine-tune in place; returns the mean loss of each epoch."""
    previous = torch.are_deterministic_algorithms_enabled()
    torch.manual_seed(cfg.seed)
    torch.use_deterministic_algorithms(True)  # noqa: FBT003  (torch API)
    try:
        model.train()
        optimizer = torch.optim.Adam(
            model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay
        )
        criterion = torch.nn.CrossEntropyLoss(weight=torch.tensor(cfg.class_weights))
        losses = []
        for epoch in range(cfg.epochs):
            order = epoch_order(len(items), cfg.seed, epoch, cfg.max_items_per_epoch)
            total, seen = 0.0, 0
            for first in range(0, len(order), cfg.batch_size):
                batch = [items[i] for i in order[first : first + cfg.batch_size]]
                windows = [
                    example(
                        source(item),
                        np.random.default_rng([cfg.seed, epoch, datasets.item_seed(item)]),
                        cfg.conditions,
                    )
                    for item in batch
                ]
                x = torch.from_numpy(np.stack(windows))
                # Item label 1 is synthetic; upstream target 1 is bona fide.
                y = torch.tensor([1 - item.label for item in batch], dtype=torch.int64)
                loss = criterion(model(x), y)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                total += float(loss.item()) * len(batch)
                seen += len(batch)
            losses.append(total / seen)
        model.eval()
        return losses
    finally:
        torch.use_deterministic_algorithms(previous)


def check_out_dir(out: Path) -> Path:
    """Refuse an output folder inside the repository (design P34)."""
    target = out.resolve()
    if target.is_relative_to(REPO_ROOT):
        msg = "--out must be outside the repository: fine-tuned weights are never committed"
        raise FinetuneError(msg)
    return target


def run(
    cfg: FinetuneConfig,
    out: Path,
    items: Sequence[datasets.Item],
    source: Callable[[datasets.Item], codecs.Audio],
    today: dt.date,
) -> dict[str, object]:
    """Train, then write model.pth, run.json and, with exportOnnx, the ONNX model."""
    folder = check_out_dir(out)
    torch.manual_seed(cfg.seed)  # before building: random init must be seeded too
    model, start_sha = initial_model(cfg)
    losses = train(cfg, model, items, source)
    folder.mkdir(parents=True, exist_ok=True)
    weights = folder / "model.pth"
    torch.save(model.model.state_dict(), weights)
    record: dict[str, object] = {
        "date": today.isoformat(),
        "config": {key: getattr(cfg, field) for key, field in _FIELDS.items()},
        "startCheckpointSha256": start_sha,
        "items": len(items),
        "epochLoss": [round(v, 6) for v in losses],
        "modelSha256": hashlib.sha256(weights.read_bytes()).hexdigest(),
    }
    if cfg.export_onnx:
        spec = dataclasses.replace(
            candidates.spec(cfg.candidate),
            model_id=cfg.model_id,
            source=f"{candidates.spec(cfg.candidate).source}, fine-tuned ({cfg.dataset})",
        )
        done = export.export_model(model, spec, folder, None, today)
        record["onnx"] = {"manifest": done.manifest_path.name, "maxAbsDiff": done.max_abs_diff}
    text = json.dumps(record, indent=2, default=str) + "\n"
    (folder / "run.json").write_text(text, encoding="utf-8")
    return record


def main(argv: list[str] | None = None) -> int:
    """CLI entry point (not a mise verb: it runs only if the gate fails)."""
    parser = argparse.ArgumentParser(prog="model_lab.finetune", description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True, help="folder outside the repository")
    args = parser.parse_args(argv)
    try:
        cfg = parse_config(json.loads(args.config.read_text(encoding="utf-8")))
        check_out_dir(args.out)
        items, source = training_data(cfg)
    except (FinetuneError, haunt_set.DatasetError, json.JSONDecodeError) as error:
        sys.stderr.write(f"model_lab.finetune: {error}\n")
        return 2
    record = run(cfg, args.out, items, source, dt.datetime.now(dt.UTC).date())
    sys.stdout.write(f"model_lab.finetune: epoch loss {record['epochLoss']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
