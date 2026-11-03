"""The Kiro power in powers/doppelganger/ (kiro-workbench Requirement 8, design P37)."""

import contextlib
import json
import os
import re
import subprocess
import threading
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
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "power-test", "version": "0"},
        },
    }
    stderr_path = tmp_path / "server-stderr.log"
    try:
        stderr_file = stderr_path.open("wb")
        proc = subprocess.Popen(  # noqa: S603  (fixed command from the committed mcp.json)
            [server["command"], *server["args"]],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=stderr_file,
            text=True,
            env=env,
            cwd=tmp_path,  # any working directory: the command must not depend on it
        )
    except FileNotFoundError:
        stderr_file.close()
        pytest.skip("sh or uv not on PATH")
    stdin, stdout = proc.stdin, proc.stdout
    assert stdin is not None
    assert stdout is not None
    timer = threading.Timer(120, proc.kill)  # never hang the suite
    timer.start()

    def send(message: dict[str, Any]) -> None:
        stdin.write(json.dumps(message) + "\n")
        stdin.flush()

    def reply(wanted: int) -> dict[str, Any]:
        # Keep stdin open until the answer arrives, like a real client: closing it early
        # lets the server exit before it answers.
        for line in stdout:
            message: dict[str, Any] = json.loads(line)
            if message.get("id") == wanted:
                return message
        stderr_file.flush()
        tail = stderr_path.read_bytes()[-2048:].decode("utf-8", "replace")
        msg = f"server exited before answering request {wanted}; stderr tail:\n{tail}"
        raise AssertionError(msg)

    try:
        send(initialize)
        reply(1)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        tools = reply(2)["result"]["tools"]
    finally:
        timer.cancel()
        with contextlib.suppress(BrokenPipeError):  # the server may already be gone
            stdin.close()
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            # Kill and reap instead of raising here, so the real assertion is not masked.
            proc.kill()
            proc.wait()
        stderr_file.close()
    assert {t["name"] for t in tools} == {"analyze_audio_file", "list_models", "explain_thresholds"}
