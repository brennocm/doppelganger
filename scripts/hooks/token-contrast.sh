#!/usr/bin/env bash
# Hook token-contrast (kiro-workbench Requirement 1.4).
# Rebuilds the design tokens; the token build asserts every pair in
# packages/tokens/contrast-pairs.json and fails on any pair below its target.
# Exit 1 sends the failing pairs to the agent.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

if ! mise x -- node -e 'process.exit(require("./packages/tokens/package.json").scripts?.build ? 0 : 1)' 2>/dev/null; then
  echo "token-contrast: packages/tokens has no build script yet (added by haunted-ui); nothing checked"
  exit 0
fi
if ! out="$(mise x -- pnpm --filter @doppelganger/tokens run build 2>&1)"; then
  printf 'token-contrast: token build failed (contrast pairs below target or build error)\n%s\n' "$out" | tail -n 60 >&2
  exit 1
fi
printf '%s\n' "$out" | tail -n 20
echo "token-contrast: every contrast pair meets its target"
