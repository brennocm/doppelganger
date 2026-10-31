#!/usr/bin/env bash
# Dependency audit (Requirement 4.4). Called by `mise run check:all`.
#   - pnpm audit over pnpm-lock.yaml
#   - pip-audit over the exact versions in uv.lock (hashed export, no resolution)
#   - license policy over every installed npm and Python package
set -euo pipefail

echo "audit: pnpm audit"
pnpm audit

echo "audit: pip-audit"
requirements="$(mktemp)"
trap 'rm -f "$requirements"' EXIT
uv export --locked --all-groups --no-emit-workspace --format requirements-txt --quiet >"$requirements"
uv run --locked pip-audit --strict --progress-spinner off --disable-pip --require-hashes \
  --requirement "$requirements"

echo "audit: license policy"
uv run --locked python scripts/check_licenses.py
