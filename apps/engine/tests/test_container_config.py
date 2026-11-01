"""Static checks of the container hardening (local-runtime Requirement 5).

The image is built and inspected by the CI container test (task 5.3); these checks keep the
files from drifting even where Docker is not available.
"""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DOCKERFILE = (REPO / "infra/docker/Dockerfile").read_text(encoding="utf-8")
COMPOSE = (REPO / "infra/docker/compose.yaml").read_text(encoding="utf-8")


def test_every_base_image_is_pinned_by_digest() -> None:
    images = re.findall(r"^FROM\s+(\S+)", DOCKERFILE, re.MULTILINE)
    images += re.findall(r"--from=(\S+/\S+)", DOCKERFILE)
    assert images
    for image in images:
        assert re.search(r"@sha256:[0-9a-f]{64}$", image), image


def test_runtime_runs_as_uid_10001_without_build_tools() -> None:
    runtime = DOCKERFILE.split("AS runtime", 1)[1]
    assert "USER 10001:10001" in runtime
    for tool in ("apt-get install", "gcc", "build-essential", "pip install", "uv "):
        assert tool not in runtime


def test_compose_publishes_loopback_only_and_hardens_the_container() -> None:
    ports = re.findall(
        r'^\s+- "([^"]+)"$', COMPOSE.split("ports:", 1)[1].split("read_only", 1)[0], re.MULTILINE
    )
    assert ports == ["127.0.0.1:${DOPPELGANGER_PORT:-8787}:8787"]
    for setting in (
        "read_only: true",
        "/tmp:rw,noexec,nosuid",  # noqa: S108  (the expected Compose setting)
        "cap_drop:\n      - ALL",
        "no-new-privileges:true",
        'user: "10001:10001"',
        "mem_limit:",
        "cpus:",
        "target: /models\n        read_only: true",
    ):
        assert setting in COMPOSE, setting
    assert "0.0.0.0" not in COMPOSE  # noqa: S104  (asserts it is absent)
