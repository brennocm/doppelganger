"""Engine configuration from environment variables, validated at startup (Requirement 1.1)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

if TYPE_CHECKING:
    from collections.abc import Mapping

ORIGIN: Final = re.compile(r"^http://(127\.0\.0\.1|localhost):[0-9]{1,5}$")
MODEL_ID: Final = re.compile(r"^[a-z0-9][a-z0-9.-]{0,63}$")


class ConfigError(ValueError):
    """An environment variable is missing or invalid; the message names it."""


class Settings(BaseModel):
    """The five variables the engine reads; nothing else configures it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    port: int = Field(8787, ge=1, le=65535)
    model_dir: Path = Path("/models")
    model_id: str
    allowed_origin: str = "http://127.0.0.1:8787"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    @field_validator("model_id")
    @classmethod
    def _model_id(cls, value: str) -> str:
        if not MODEL_ID.fullmatch(value):
            msg = "must be a manifest ID (lowercase letters, digits, '.' and '-')"
            raise ValueError(msg)
        return value

    @field_validator("allowed_origin")
    @classmethod
    def _origin(cls, value: str) -> str:
        # Exactly one loopback origin, no path or trailing slash (the guard compares it as is).
        if not ORIGIN.fullmatch(value):
            msg = "must be http://127.0.0.1:<port> or http://localhost:<port>"
            raise ValueError(msg)
        return value

    @property
    def manifest_path(self) -> Path:
        """The model's manifest inside MODEL_DIR."""
        return self.model_dir / f"{self.model_id}.json"


_ENV: Final = {
    "PORT": "port",
    "MODEL_DIR": "model_dir",
    "MODEL_ID": "model_id",
    "ALLOWED_ORIGIN": "allowed_origin",
    "LOG_LEVEL": "log_level",
}


def load_settings(env: Mapping[str, str]) -> Settings:
    """Build Settings from the environment, or raise ConfigError naming the variable."""
    values = {field: env[name] for name, field in _ENV.items() if name in env}
    try:
        settings = Settings.model_validate(values)
    except ValidationError as error:
        first = error.errors()[0]
        field = str(first["loc"][0]) if first["loc"] else "?"
        name = next((n for n, f in _ENV.items() if f == field), field.upper())
        msg = f"{name}: {first['msg']}"
        raise ConfigError(msg) from None
    if not settings.model_dir.is_dir():
        msg = "MODEL_DIR: not a directory"
        raise ConfigError(msg)
    if not settings.manifest_path.is_file():
        msg = "MODEL_ID: no manifest with this ID in MODEL_DIR"
        raise ConfigError(msg)
    return settings
