#!/usr/bin/env bash
# Run tests. Called by `mise run test`.
#
#   mise run test                          # every TS and Python package
#   mise run test -- packages/detector     # one package (TS or Python), detected by its manifest
#   mise run test -- apps/engine packages/tokens
set -euo pipefail

if (($# == 0)); then
  pnpm -r run test
  uv run --locked pytest -q
  # Installer tests with stubbed commands (local-runtime 6.4); bats comes from .mise.toml.
  bats scripts/tests/*.bats
  # Node scripts' tests (journal digest, submission 2.2).
  node --test scripts/tests/*.test.mjs
  exit 0
fi

for target in "$@"; do
  target="${target%/}"
  if [[ "$target" == "scripts" ]]; then
    uv run --locked pytest -q scripts/tests
    bats scripts/tests/*.bats
    node --test scripts/tests/*.test.mjs
  elif [[ -f "$target/package.json" ]]; then
    pnpm --filter "./$target" run test
  elif [[ -f "$target/pyproject.toml" ]]; then
    uv run --locked pytest -q "$target/tests"
  else
    echo "test: '$target' is not a workspace package (no package.json or pyproject.toml)" >&2
    exit 2
  fi
done
