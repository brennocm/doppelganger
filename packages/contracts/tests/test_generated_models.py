import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from doppelganger_contracts.generated.model_manifest_schema import ModelManifest

CONTRACTS = Path(__file__).resolve().parents[1]


def _example() -> dict[str, object]:
    text = (CONTRACTS / "fixtures/model-manifest.example.json").read_text(encoding="utf-8")
    data: dict[str, object] = json.loads(text)
    return data


def test_the_example_manifest_validates() -> None:
    manifest = ModelManifest.model_validate(_example())
    assert manifest.windowSamples == 64600  # noqa: PLR2004


@pytest.mark.parametrize(
    ("key", "value"),
    [("sampleRate", 44100), ("sha256", "ABC"), ("extra", 1), ("spoofIndex", 2)],
)
def test_invalid_manifests_are_rejected(key: str, value: object) -> None:
    with pytest.raises(ValidationError):
        ModelManifest.model_validate({**_example(), key: value})
