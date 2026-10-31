#!/usr/bin/env bash
# Hook test-affected (kiro-workbench Requirements 1.1, 1.2).
# Runs the tests of the package that owns the saved file, through the same mise
# tasks CI uses. Exit 1 sends the failure output to the agent.
set -uo pipefail
# shellcheck source=scripts/hooks/resolve-path.sh
source "$(dirname "$0")/resolve-path.sh"

rel="$(hook_path "$@")" || { echo "test-affected: no file path in the hook event" >&2; exit 0; }

case "$rel" in
  packages/*/*.ts | apps/web/*.ts)
    pkg="$(cut -d/ -f1-2 <<<"$rel")"
    kind=ts
    ;;
  apps/engine/*.py | packages/model-lab/*.py | packages/doppelganger-mcp/*.py)
    pkg="$(cut -d/ -f1-2 <<<"$rel")"
    kind=py
    ;;
  *)
    exit 0
    ;;
esac

if [[ "$kind" == py ]]; then
  out="$(mise x -- uv run --locked ruff check "$rel" 2>&1 && mise x -- mise run -q test -- "$pkg" 2>&1)"
else
  out="$(mise x -- mise run -q test -- "$pkg" 2>&1)"
fi
status=$?

if ((status != 0)); then
  printf 'test-affected: %s failed for %s\n%s\n' "$pkg" "$rel" "$out" | tail -n 60 >&2
  exit 1
fi
echo "test-affected: $pkg passed ($rel)"
