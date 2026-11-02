"""Doppelgänger MCP server over stdio (kiro-workbench Requirement 7, design P36).

Run from the repository root:
    uv run --locked --package doppelganger-mcp python -m doppelganger_mcp
"""

from __future__ import annotations

from typing import Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from doppelganger_mcp import analysis, sandbox

mcp = MCPServer("doppelganger")


@mcp.tool()
def analyze_audio_file(path: str, model_id: str | None = None) -> dict[str, Any]:
    """Score a WAV file under an allowed folder for signs of a synthetic voice.

    Returns per-window Dissonance_Scores (null for windows without speech), the peak and
    mean, the haunting state timeline and the verdict. The score is probabilistic: it is not
    proof and does not identify a person. Allowed folders come from DOPPELGANGER_MCP_ROOTS.
    """
    try:
        data = sandbox.read_allowed(path, sandbox.roots_from_env())
        model = analysis.load_model(analysis.model_dirs_from_env(), model_id)
        return analysis.analyze_bytes(data, model)
    except (sandbox.SandboxError, analysis.AnalysisError) as error:
        raise ToolError(str(error)) from None


@mcp.tool()
def list_models() -> list[dict[str, Any]]:
    """List the local model manifests with their SHA-256, license, window and hop sizes."""
    return analysis.list_models(analysis.model_dirs_from_env())


@mcp.tool()
def explain_thresholds() -> dict[str, Any]:
    """Explain the thresholds, smoothing and hysteresis behind the Autopsy verdict."""
    return analysis.explain_thresholds()


def main() -> None:
    """Serve on stdio until the client closes the pipes."""
    mcp.run()
