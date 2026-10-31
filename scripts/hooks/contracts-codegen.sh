#!/usr/bin/env bash
# Hook contracts-codegen (kiro-workbench Requirement 1.3).
# Regenerates TS and Python types from the JSON Schemas and lists generated files
# that changed. Exit 1 sends a failure to the agent.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

before="$(git status --porcelain -- packages/contracts | sort)"
if ! out="$(mise x -- mise run -q gen:contracts 2>&1)"; then
  printf 'contracts-codegen: mise run gen:contracts failed\n%s\n' "$out" | tail -n 40 >&2
  exit 1
fi
after="$(git status --porcelain -- packages/contracts | sort)"
changed="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | sed -E 's/^.. //' | grep -v '/schemas/' || true)"

printf '%s\n' "$out"
if [[ -n "$changed" ]]; then
  printf 'contracts-codegen: generated files changed:\n%s\n' "$changed"
else
  echo "contracts-codegen: no generated files changed"
fi
