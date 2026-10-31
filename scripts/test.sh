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
  exit 0
fi

for target in "$@"; do
  target="${target%/}"
  if [[ -f "$target/package.json" ]]; then
    pnpm --filter "./$target" run test
  elif [[ -f "$target/pyproject.toml" ]]; then
    uv run --locked pytest -q "$target/tests"
  else
    echo "test: '$target' is not a workspace package (no package.json or pyproject.toml)" >&2
    exit 2
  fi
done
