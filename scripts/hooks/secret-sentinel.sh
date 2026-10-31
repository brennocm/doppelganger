#!/usr/bin/env bash
# Hook secret-sentinel (kiro-workbench Requirements 2.1, 2.4).
# Scans one saved file for credentials (gitleaks) and personal data
# (scripts/pii_scan.py: e-mails, home paths, IPv4 addresses, placeholders ignored)
# and adds each finding, masked, to the Turn_Report (scripts/hooks/findings.py).
# Always exits 0: the hook-findings Stop hook delivers the report to the agent.
set -uo pipefail
# shellcheck source=scripts/hooks/resolve-path.sh
source "$(dirname "$0")/resolve-path.sh"

event=""
[[ -t 0 ]] || event="$(cat)"
rel="$(hook_path "$@" <<<"$event")" || { echo "secret-sentinel: no file path in the hook event"; exit 0; }
cd "$(git rev-parse --show-toplevel)" || exit 0
[[ -f "$rel" ]] || exit 0
case "$rel" in node_modules/* | */node_modules/* | .venv/* | dist/* | .git/*) exit 0 ;; esac

mise x -- python scripts/hooks/findings.py scan-secrets "$rel" <<<"$event" ||
  echo "secret-sentinel: could not update the Turn_Report for $rel"
exit 0
