"""AASIST-L and AASIST checkpoint loaders (detection-model task 4.1, design P31).

`fetch` downloads a pinned checkpoint into the cache (outside the repository) and refuses it
unless its size and SHA-256 match `checkpoints.json`. `load` builds the upstream model with
its config and loads the state dict with `weights_only=True`. `export_candidate` writes a
fp32 ONNX model and its manifest through `model_lab.export`.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Final

import torch

from model_lab import export

if TYPE_CHECKING:
    from collections.abc import Callable

HERE: Final = Path(__file__).resolve().parent
CATALOG: Final = json.loads((HERE / "checkpoints.json").read_text(encoding="utf-8"))
NAMES: Final = tuple(CATALOG["candidates"])
WINDOW: Final = 64_600
HOP: Final = 16_000
#: Upstream output index 1 is bona fide, so the spoof logit is index 0.
SPOOF_INDEX: Final = 0


class CheckpointError(RuntimeError):
    """A checkpoint is missing, unpinned or does not match its recorded hash."""


def cache_dir() -> Path:
    """`$DOPPELGANGER_CACHE`, or `~/.cache/doppelganger`: never inside the repository."""
    root = os.environ.get("DOPPELGANGER_CACHE")
    return Path(root) if root else Path.home() / ".cache" / "doppelganger"


def sha256_file(path: Path) -> str:
    """Hex SHA-256 of a file."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _entry(name: str) -> dict[str, Any]:
    if name not in CATALOG["candidates"]:
        msg = f"unknown candidate {name!r}; known: {', '.join(NAMES)}"
        raise CheckpointError(msg)
    entry: dict[str, Any] = CATALOG["candidates"][name]
    return entry


def verify(path: Path, name: str) -> None:
    """Raise unless the file has the recorded size and SHA-256."""
    entry = _entry(name)
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        msg = f"{name}: checkpoint missing or wrong size"
        raise CheckpointError(msg)
    if sha256_file(path) != entry["sha256"]:
        msg = f"{name}: checkpoint SHA-256 does not match checkpoints.json"
        raise CheckpointError(msg)


def _https_get(url: str) -> bytes:
    if not url.startswith("https://"):
        msg = "checkpoints are fetched over HTTPS only"
        raise CheckpointError(msg)
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310  (https checked above)
        data: bytes = response.read()
    return data


def fetch(name: str, root: Path | None = None, get: Callable[[str], bytes] = _https_get) -> Path:
    """The verified checkpoint, downloading it first if it is not cached."""
    entry = _entry(name)
    folder = (root or cache_dir()) / "checkpoints"
    path = folder / Path(entry["url"]).name
    if path.is_file():
        verify(path, name)
        return path
    data = get(entry["url"])
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        msg = f"{name}: downloaded checkpoint does not match checkpoints.json; nothing kept"
        raise CheckpointError(msg)
    folder.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".partial")
    partial.write_bytes(data)
    partial.replace(path)
    return path


def upstream_code_ok() -> bool:
    """True when the vendored upstream files still have their recorded SHA-256."""
    up: dict[str, str] = CATALOG["upstream"]
    return (
        sha256_file(HERE / "upstream" / "aasist_model.py") == up["modelCodeSha256"]
        and sha256_file(HERE / "upstream" / "LICENSE") == up["licenseSha256"]
    )


class LogitsOnly(torch.nn.Module):
    """Upstream `Model.forward` returns (embedding, logits); export needs the logits only."""

    def __init__(self, model: torch.nn.Module) -> None:
        """Wrap an upstream model."""
        super().__init__()
        self.model = model

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        """Two logits per window: index 0 spoof, index 1 bona fide."""
        _, logits = self.model(waveform)
        out: torch.Tensor = logits
        return out


def build(name: str) -> torch.nn.Module:
    """The upstream model for a candidate, with random weights."""
    if not upstream_code_ok():
        msg = "vendored upstream code does not match its recorded SHA-256"
        raise CheckpointError(msg)
    from model_lab.candidates.upstream.aasist_model import Model  # noqa: PLC0415

    # The upstream class is untyped (excluded from mypy); its constructor takes the config.
    factory: Callable[[dict[str, Any]], torch.nn.Module] = Model
    return factory(dict(_entry(name)["modelConfig"]))


def load(name: str, checkpoint: Path) -> LogitsOnly:
    """Build the model, load the verified checkpoint safely, and wrap it for export."""
    verify(checkpoint, name)
    model = build(name)
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    model.load_state_dict(state, strict=True)
    wrapped = LogitsOnly(model)
    wrapped.eval()
    return wrapped


@dataclass(frozen=True)
class Exported:
    """What `export_candidate` wrote."""

    manifest_path: Path
    max_abs_diff: float
    bytes: int


def spec(name: str) -> export.ExportSpec:
    """Manifest fields of a candidate (fp32 until the gate measures int8 on the Haunt_Set)."""
    entry = _entry(name)
    up = CATALOG["upstream"]
    return export.ExportSpec(
        model_id=name,
        version="0.1.0",
        role="light",
        window_samples=WINDOW,
        hop_samples=HOP,
        output_kind="two-class-logits",
        spoof_index=SPOOF_INDEX,
        temperature=1.0,
        license=dict(entry["license"]),
        source=f"{up['repository']} @ {up['commit']}, {Path(entry['url']).name}",
    )


def export_candidate(name: str, out_dir: Path, root: Path | None = None) -> Exported:
    """Fetch, verify, load and export one candidate to fp32 ONNX with its manifest."""
    module = load(name, fetch(name, root))
    result = export.export_model(module, spec(name), out_dir, None, dt.datetime.now(dt.UTC).date())
    return Exported(result.manifest_path, result.max_abs_diff, result.manifest.bytes)
