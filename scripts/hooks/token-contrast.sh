#!/usr/bin/env bash
# Hook token-contrast (kiro-workbench Requirement 1.4).
# Rebuilds the design tokens; the token build asserts every pair in
# packages/tokens/contrast-pairs.json and fails on any pair below its target.
# A failure is added to the Turn_Report (scripts/hooks/findings.py). Always exits 0.
set -uo pipefail
event=""
[[ -t 0 ]] || event="$(cat)"
cd "$(git rev-parse --show-toplevel)" || exit 0
findings() { mise x -- python scripts/hooks/findings.py "$@" <<<"$event"; }

if ! mise x -- node -e 'process.exit(require("./packages/tokens/package.json").scripts?.build ? 0 : 1)' 2>/dev/null; then
  echo "token-contrast: packages/tokens has no build script yet (added by haunted-ui); nothing checked"
  exit 0
fi
if ! mise x -- pnpm --filter @doppelganger/tokens run build >/dev/null 2>&1; then
  findings record token-contrast packages/tokens contrast-failure "token build failed (a contrast pair below target or a build error); reproduce with \`pnpm --filter @doppelganger/tokens run build\`"
  echo "token-contrast: token build failed (added to the Turn_Report)"
  exit 0
fi
findings clear token-contrast packages/tokens
echo "token-contrast: every contrast pair meets its target"
