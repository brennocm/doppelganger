#!/usr/bin/env bash
# Hook test-affected (kiro-workbench Requirements 1.1, 1.2).
# Runs the tests of the package that owns the saved file, through the same mise
# tasks CI uses, and records a failure in the Turn_Report (scripts/hooks/findings.py).
# Test output is not copied, because it could echo a secret; the finding names the
# command that reproduces it. Always exits 0.
set -uo pipefail
# shellcheck source=scripts/hooks/resolve-path.sh
source "$(dirname "$0")/resolve-path.sh"

event=""
[[ -t 0 ]] || event="$(cat)"
rel="$(hook_path "$@" <<<"$event")" || { echo "test-affected: no file path in the hook event"; exit 0; }
cd "$(git rev-parse --show-toplevel)" || exit 0

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

findings() { mise x -- python scripts/hooks/findings.py "$@" <<<"$event"; }

if [[ "$kind" == py ]] && ! mise x -- uv run --locked ruff check -q "$rel" >/dev/null 2>&1; then
  findings record test-affected "$pkg" lint-failure "ruff found problems in $rel; reproduce with \`mise x -- uv run ruff check $rel\`"
  echo "test-affected: ruff failed for $rel (added to the Turn_Report)"
  exit 0
fi
if ! mise x -- mise run -q test -- "$pkg" >/dev/null 2>&1; then
  findings record test-affected "$pkg" test-failure "tests failed after saving $rel; reproduce with \`mise run test -- $pkg\`"
  echo "test-affected: $pkg failed (added to the Turn_Report)"
  exit 0
fi
findings clear test-affected "$pkg"
echo "test-affected: $pkg passed ($rel)"
