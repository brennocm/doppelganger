#!/usr/bin/env bash
# Hook contracts-codegen (kiro-workbench Requirement 1.3).
# Regenerates TS and Python types from the JSON Schemas and adds the changed generated
# files, or a failure, to the Turn_Report (scripts/hooks/findings.py). Always exits 0.
set -uo pipefail
event=""
[[ -t 0 ]] || event="$(cat)"
cd "$(git rev-parse --show-toplevel)" || exit 0
findings() { mise x -- python scripts/hooks/findings.py "$@" <<<"$event"; }

before="$(git status --porcelain -- packages/contracts | sort)"
if ! out="$(mise x -- mise run -q gen:contracts 2>&1)"; then
  findings record contracts-codegen packages/contracts codegen-failure "mise run gen:contracts failed; reproduce with \`mise run gen:contracts\`"
  echo "contracts-codegen: mise run gen:contracts failed (added to the Turn_Report)"
  exit 0
fi
after="$(git status --porcelain -- packages/contracts | sort)"
changed="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | sed -E 's/^.. //' | grep -v '/schemas/' || true)"

printf '%s\n' "$out" | tail -n 5
if [[ -n "$changed" ]]; then
  findings record contracts-codegen packages/contracts generated-files-changed "$(paste -sd ' ' <<<"$changed")"
  echo "contracts-codegen: generated files changed (added to the Turn_Report)"
else
  findings clear contracts-codegen packages/contracts
  echo "contracts-codegen: no generated files changed"
fi
