#!/usr/bin/env bash
# Block files that must never be committed (see .kiro/steering/security.md):
#   - .env and .env.* (except .env.example)
#   - private keys and certificates (*.pem, *.key, *.p12, *.pfx)
#   - audio files outside apps/web/public/replay/
#
# Usage:
#   scripts/check-forbidden-paths.sh           # staged files (pre-commit)
#   scripts/check-forbidden-paths.sh --all     # every tracked file (CI)
set -euo pipefail

mode="${1:---staged}"

case "$mode" in
  --staged) list_cmd=(git diff --cached --name-only -z --diff-filter=ACMR) ;;
  --all) list_cmd=(git ls-files -z) ;;
  *)
    echo "usage: $0 [--staged|--all]" >&2
    exit 2
    ;;
esac

violations=0

report() {
  printf 'forbidden-path: %s (%s)\n' "$1" "$2" >&2
  violations=$((violations + 1))
}

while IFS= read -r -d '' path; do
  name="${path##*/}"
  lower="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"

  case "$lower" in
    .env.example) ;;
    .env | .env.*) report "$path" "environment file" ;;
    *.pem | *.key | *.p12 | *.pfx) report "$path" "key or certificate" ;;
    *.wav | *.mp3 | *.ogg | *.opus | *.flac | *.m4a | *.aac | *.webm)
      case "$path" in
        apps/web/public/replay/*) ;;
        *) report "$path" "audio outside apps/web/public/replay/" ;;
      esac
      ;;
  esac
done < <("${list_cmd[@]}")

if ((violations > 0)); then
  printf 'forbidden-path: %d file(s) blocked. Remove them from the index (git rm --cached <path>).\n' "$violations" >&2
  exit 1
fi
