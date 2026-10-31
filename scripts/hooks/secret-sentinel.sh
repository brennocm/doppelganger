#!/usr/bin/env bash
# Hook secret-sentinel (kiro-workbench Requirement 2.1).
# Scans one saved file for credentials (gitleaks) and personal data
# (scripts/pii_scan.py: e-mails, home paths, IPv4 addresses, placeholders ignored).
# Prints path:line for every finding. Exit 1 sends the findings to the agent.
set -uo pipefail
# shellcheck source=scripts/hooks/resolve-path.sh
source "$(dirname "$0")/resolve-path.sh"

rel="$(hook_path "$@")" || { echo "secret-sentinel: no file path in the hook event" >&2; exit 0; }
cd "$(git rev-parse --show-toplevel)" || exit 1
[[ -f "$rel" ]] || exit 0
case "$rel" in node_modules/* | */node_modules/* | .venv/* | dist/* | .git/*) exit 0 ;; esac

findings=""
report="$(mktemp)"
trap 'rm -f "$report"' EXIT

mise x -- gitleaks dir --no-banner --redact --log-level error \
  --report-format json --report-path "$report" --exit-code 3 "$rel" >/dev/null 2>&1
case $? in
  0) ;;
  3)
    # shellcheck disable=SC2016  # ${...} is a JavaScript template literal, not shell
    findings+="$(mise x -- node -e '
      for (const f of JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))) console.log(`${f.File}:${f.StartLine}: secret: ${f.RuleID} (redacted)`);
    ' "$report")"$'\n'
    ;;
  *) findings+="$rel: secret-sentinel: gitleaks failed to scan this file"$'\n' ;;
esac

pii="$(mise x -- python scripts/pii_scan.py "$rel" 2>&1)" || findings+="$pii"$'\n'

if [[ -n "${findings//$'\n'/}" ]]; then
  printf 'secret-sentinel: findings in %s\n%s' "$rel" "$findings" >&2
  exit 1
fi
echo "secret-sentinel: $rel clean"
