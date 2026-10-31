"""Model_Manifest writing and verification (detection-model Requirement 5.4).

The schema lives in packages/contracts/schemas/model-manifest.schema.json; the Pydantic
model is generated from it, so a manifest written here is valid for the browser too.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import TYPE_CHECKING

from doppelganger_contracts.generated.model_manifest_schema import ModelManifest

if TYPE_CHECKING:
    from pathlib import Path

__all__ = ["IntegrityError", "ModelManifest", "load", "sha256_hex", "verify", "write"]


class IntegrityError(ValueError):
    """The model bytes do not match the manifest."""


def sha256_hex(data: bytes) -> str:
    """Lower-case hex SHA-256 of data."""
    return hashlib.sha256(data).hexdigest()


def verify(manifest: ModelManifest, model_bytes: bytes) -> None:
    """Raise IntegrityError unless the bytes match the manifest's size and SHA-256."""
    if len(model_bytes) != manifest.bytes:
        msg = f"model {manifest.id}: size {len(model_bytes)} != manifest {manifest.bytes}"
        raise IntegrityError(msg)
    if not hmac.compare_digest(sha256_hex(model_bytes), manifest.sha256):
        msg = f"model {manifest.id}: SHA-256 does not match the manifest"
        raise IntegrityError(msg)


def to_json(manifest: ModelManifest) -> str:
    """Serialize in the committed format (two-space indent, schema field order)."""
    return json.dumps(manifest.model_dump(mode="json", exclude_none=True), indent=2) + "\n"


def write(manifest: ModelManifest, path: Path) -> None:
    """Write the manifest as JSON."""
    path.write_text(to_json(manifest), encoding="utf-8")


def load(path: Path) -> ModelManifest:
    """Read and validate a manifest file."""
    return ModelManifest.model_validate_json(path.read_text(encoding="utf-8"))
