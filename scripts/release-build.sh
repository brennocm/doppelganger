#!/usr/bin/env bash
# Build the web app and package the Release_Bundle (local-runtime task 6.5, design P45).
#
#   scripts/release-build.sh --version X.Y.Z --out DIR --models DIR [--allow-test-model]
#
# The version must equal VERSION in scripts/install.sh, because the installer downloads
# that tag. Creates no tag and no release.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
version="" out_dir="" models_dir="" extra=()

fail() {
  echo "release-build: $*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --version) version="${2:?--version needs a value}"; shift ;;
    --out) out_dir="${2:?--out needs a value}"; shift ;;
    --models) models_dir="${2:?--models needs a value}"; shift ;;
    --allow-test-model) extra+=(--allow-test-model) ;;
    *) fail "unknown option: $1" ;;
  esac
  shift
done

[[ -n "$version" && -n "$out_dir" && -n "$models_dir" ]] ||
  fail "usage: release-build.sh --version X.Y.Z --out DIR --models DIR [--allow-test-model]"

installer_version="$(sed -n 's/^VERSION="\([0-9.]*\)"$/\1/p' "$root/scripts/install.sh" | head -n 1)"
[[ "$version" == "$installer_version" ]] ||
  fail "version $version is not the installer's VERSION ($installer_version)"

web_dir="$(mktemp -d)"
trap 'rm -rf -- "$web_dir"' EXIT
pnpm --filter @doppelganger/web exec vite build --base=/app/ --outDir "$web_dir" --emptyOutDir

"$root/scripts/release-bundle.sh" --version "$version" --web-dir "$web_dir" \
  --models "$models_dir" --out "$out_dir" "${extra[@]}"
