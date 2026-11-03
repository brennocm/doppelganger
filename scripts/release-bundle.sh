#!/usr/bin/env bash
# Package the Release_Bundle (local-runtime task 6.5, design P45). No network access.
#
#   scripts/release-bundle.sh --version X.Y.Z --web-dir DIR --models DIR --out DIR \
#                             [--allow-test-model]
#
# Writes into --out: doppelganger-web-<version>.tar.gz (the web build at the archive
# root), every model manifest and model file from --models, and SHA256SUMS in the form
# scripts/install.sh reads. Refuses a test model unless --allow-test-model is given.
set -euo pipefail

version="" web_dir="" models_dir="" out_dir="" allow_test=0

fail() {
  echo "release-bundle: $*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --version) version="${2:?--version needs a value}"; shift ;;
    --web-dir) web_dir="${2:?--web-dir needs a value}"; shift ;;
    --models) models_dir="${2:?--models needs a value}"; shift ;;
    --out) out_dir="${2:?--out needs a value}"; shift ;;
    --allow-test-model) allow_test=1 ;;
    *) fail "unknown option: $1" ;;
  esac
  shift
done

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "--version must look like X.Y.Z"
[[ -f "$web_dir/index.html" ]] || fail "--web-dir must hold a web build (index.html not found)"
[[ -d "$models_dir" ]] || fail "--models must be a folder with model manifests"
[[ -n "$out_dir" ]] || fail "--out is required"

mapfile -t manifests < <(find "$models_dir" -maxdepth 1 -name '*.json' | sort)
((${#manifests[@]} > 0)) || fail "no model manifest (*.json) in $models_dir"

rm -rf -- "$out_dir"
mkdir -p "$out_dir"

# Each manifest must describe the model file next to it, byte for byte.
for manifest in "${manifests[@]}"; do
  name="$(basename "$manifest")"
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe manifest name: $name"
  read -r role file sha bytes < <(python3 - "$manifest" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print(d["role"], d["file"], d["sha256"], d["bytes"])
EOF
  ) || fail "$name: not a model manifest"
  [[ "$file" =~ ^[A-Za-z0-9._-]+$ ]] || fail "$name: unsafe model file name"
  [[ -f "$models_dir/$file" ]] || fail "$name: model file $file not found next to it"
  actual_sha="$(sha256sum "$models_dir/$file" | cut -d' ' -f1)"
  actual_bytes="$(stat -c %s "$models_dir/$file")"
  [[ "$actual_sha" == "$sha" && "$actual_bytes" == "$bytes" ]] ||
    fail "$name: $file does not match the SHA-256 or size in its manifest"
  if [[ "$role" == "test" && "$allow_test" -eq 0 ]]; then
    fail "$name: a test model can't be released (use --allow-test-model for a dry run)"
  fi
  cp -- "$manifest" "$out_dir/$name"
  cp -- "$models_dir/$file" "$out_dir/$file"
done

# Reproducible tarball: sorted names, fixed time and owner, no gzip timestamp.
tarball="doppelganger-web-$version.tar.gz"
tar --sort=name --mtime='UTC 2020-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$web_dir" -cf - . | gzip -n >"$out_dir/$tarball"

(
  cd "$out_dir"
  sums="$(mktemp)"
  find . -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort | xargs sha256sum >"$sums"
  chmod 644 "$sums"
  mv -- "$sums" SHA256SUMS
  while read -r _ name; do
    [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe file name in SHA256SUMS: $name"
  done <SHA256SUMS
  sha256sum -c --strict --quiet SHA256SUMS
)

echo "release-bundle: wrote $(find "$out_dir" -maxdepth 1 -type f | wc -l) files to $out_dir"
sed 's/^/  /' "$out_dir/SHA256SUMS"
