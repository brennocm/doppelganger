"""Static checks of .github/workflows/release.yml (local-runtime task 6.5, design P45).

The workflow can't be run here, so these keep it from drifting into something that
publishes by accident.
"""

import re
from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"
TEXT = (WORKFLOWS / "release.yml").read_text(encoding="utf-8")
DOC = yaml.safe_load(TEXT)


def test_every_action_is_pinned_by_commit_sha() -> None:
    uses = re.findall(r"^\s+uses:\s+(\S+)", TEXT, re.MULTILINE)
    assert uses
    for ref in uses:
        assert re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}", ref), ref


def test_default_permissions_are_read_only_and_only_publish_writes() -> None:
    assert DOC["permissions"] == {"contents": "read"}
    assert DOC["jobs"]["bundle"].get("permissions") is None
    assert DOC["jobs"]["publish"]["permissions"] == {"contents": "write"}


def test_publishing_needs_a_pushed_tag_and_a_green_dry_run() -> None:
    publish = DOC["jobs"]["publish"]
    assert publish["needs"] == "bundle"
    assert "refs/tags/v" in publish["if"]
    assert "push" in publish["if"]
    # A manual run can only ever be the dry run.
    assert DOC[True]["workflow_dispatch"] is None  # YAML 1.1 reads the key `on` as True


def test_releases_are_drafts_and_nothing_creates_a_tag() -> None:
    creates = re.findall(r"gh release create[^\n]*(?:\\\n[^\n]*)*", TEXT)
    assert len(creates) == 1
    assert "--draft" in creates[0]
    assert "--verify-tag" in creates[0]
    assert "git tag" not in TEXT
    assert "git push" not in TEXT


def test_the_dry_run_allows_the_test_model_and_publish_does_not() -> None:
    bundle = yaml.dump(DOC["jobs"]["bundle"])
    publish = yaml.dump(DOC["jobs"]["publish"])
    assert "--allow-test-model" in bundle
    assert "--allow-test-model" not in publish
    assert "release/models" in publish
