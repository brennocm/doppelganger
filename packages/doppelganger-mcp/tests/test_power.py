"""The Kiro power in powers/doppelganger/ (kiro-workbench Requirement 8, design P37)."""

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[3]
POWER = REPO / "powers" / "doppelganger"
#: Properties of https://agent-plugins.org/schemas/1.0.0/plugin.schema.json (checked 2026-11-02).
MANIFEST_FIELDS = {
    "$schema",
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "extensions",
}
NAME = re.compile(r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")


def _json(name: str) -> Any:  # noqa: ANN401
    return json.loads((POWER / name).read_text(encoding="utf-8"))


def test_manifest_follows_the_agent_plugins_schema() -> None:
    manifest = _json("plugin.json")
    assert manifest["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    assert set(manifest) <= MANIFEST_FIELDS
    assert NAME.fullmatch(manifest["name"])
    assert len(manifest["name"]) <= 64  # noqa: PLR2004
    assert set(manifest["author"]) <= {"name", "email", "url"}
    assert "email" not in manifest["author"]  # no personal data
    assert {"deepfake", "voice clone", "suspicious audio"} <= set(manifest["keywords"])


def test_mcp_config_has_only_variable_references() -> None:
    server = _json("mcp.json")["mcpServers"]["doppelganger"]
    assert server["type"] == "stdio"
    for value in server["env"].values():
        assert re.fullmatch(r"\$\{[A-Z_]+\}", value)
    assert "DOPPELGANGER_REPO" in server["env"]


def test_skill_front_matter_and_honesty() -> None:
    skill = POWER / "skills" / "doppelganger-safe-use" / "SKILL.md"
    text = skill.read_text(encoding="utf-8")
    front = text.split("---")[1]
    fields = dict(line.split(": ", 1) for line in front.strip().splitlines())
    assert fields["name"] == skill.parent.name
    assert len(fields["description"]) <= 1024  # noqa: PLR2004
    for doc in (text, (POWER / "README.md").read_text(encoding="utf-8")):
        assert "probabilistic" in doc
        assert "not proof" in doc
        assert "docs/model-card.md" in doc


def test_the_declared_command_starts_the_server(tmp_path: Path) -> None:
    server = _json("mcp.json")["mcpServers"]["doppelganger"]
    env = {k: v for k, v in os.environ.items() if not k.startswith("DOPPELGANGER_")}
    env["DOPPELGANGER_REPO"] = str(REPO)
    messages = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "power-test", "version": "0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    stdin = "".join(json.dumps(m) + "\n" for m in messages)
    try:
        done = subprocess.run(  # noqa: S603  (fixed command from the committed mcp.json)
            [server["command"], *server["args"]],
            input=stdin,
            capture_output=True,
            text=True,
            env=env,
            cwd=tmp_path,  # any working directory: the command must not depend on it
            timeout=120,
            check=False,
        )
    except FileNotFoundError:
        pytest.skip("sh or uv not on PATH")
    replies = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
    tools = next(r for r in replies if r.get("id") == 2)["result"]["tools"]  # noqa: PLR2004
    assert {t["name"] for t in tools} == {"analyze_audio_file", "list_models", "explain_thresholds"}
