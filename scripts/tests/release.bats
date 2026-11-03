#!/usr/bin/env bats
# scripts/release-bundle.sh and release-build.sh, and that scripts/install.sh accepts what
# they build (local-runtime task 6.5, design P45). Nothing is published and nothing leaves
# the machine: the installer's downloads are the curl stub of installer-stubs.bash, serving
# the freshly built bundle.

SCRIPTS="$BATS_TEST_DIRNAME/.."
BUNDLE="$SCRIPTS/release-bundle.sh"
INSTALL="$SCRIPTS/install.sh"
load installer-stubs

setup() {
  REAL_PATH="$PATH"
  install_stubs
  # The installer runs with the stubbed PATH (see installer()); the tests keep the real one.
  STUB_PATH="$PATH"
  PATH="$REAL_PATH"
  export REAL_PATH STUB_PATH
  FIX="$T/fixture"
  mkdir -p "$FIX/web" "$FIX/models"
  printf '<!doctype html><title>app</title>\n' >"$FIX/web/index.html"
  mkdir -p "$FIX/web/assets" && printf 'console.log(1)\n' >"$FIX/web/assets/app.js"
  make_model pro-test pro
}

teardown() {
  if [ -f "$XDG_DATA_HOME/doppelganger/static.pid" ]; then
    kill "$(cat "$XDG_DATA_HOME/doppelganger/static.pid")" 2>/dev/null || true
  fi
}

# make_model ID ROLE: a tiny model file and the manifest that describes it exactly.
make_model() {
  local id="$1" role="$2" file="$1.fp32.onnx"
  printf 'model bytes of %s\n' "$id" >"$FIX/models/$file"
  local sha bytes
  sha="$(sha256sum "$FIX/models/$file" | cut -d' ' -f1)"
  bytes="$(stat -c %s "$FIX/models/$file")"
  printf '{"id":"%s","role":"%s","file":"%s","sha256":"%s","bytes":%s}\n' \
    "$id" "$role" "$file" "$sha" "$bytes" >"$FIX/models/$id.json"
}

# installer [ARGS...]: `run` install.sh with the stubbed PATH.
installer() { run env PATH="$STUB_PATH" "$INSTALL" "$@"; }

# bundle [OPTIONS...]: build the fixture bundle into $T/out.
bundle() {
  "$BUNDLE" --version 0.1.0 --web-dir "$FIX/web" --models "$FIX/models" \
    --out "$T/out" "$@"
}

@test "a bundle has the tarball, the model files and a SHA256SUMS that checks out" {
  run bundle
  [ "$status" -eq 0 ]
  ls "$T/out" | sort | tr '\n' ' ' | grep -q '^SHA256SUMS doppelganger-web-0.1.0.tar.gz pro-test.fp32.onnx pro-test.json $'
  (cd "$T/out" && sha256sum -c --strict --quiet SHA256SUMS)
  [ "$(stat -c %a "$T/out/SHA256SUMS")" = "644" ]
  tar -tzf "$T/out/doppelganger-web-0.1.0.tar.gz" | grep -q '^./assets/app.js$'
}

@test "the tarball is reproducible" {
  bundle >/dev/null
  first="$(sha256sum "$T/out/doppelganger-web-0.1.0.tar.gz")"
  touch "$FIX/web/index.html"
  bundle >/dev/null
  [ "$first" = "$(sha256sum "$T/out/doppelganger-web-0.1.0.tar.gz")" ]
}

@test "install.sh --static accepts the bundle through its checksum path" {
  bundle >/dev/null
  RELEASE="$T/out"
  export RELEASE
  installer --static
  [ "$status" -eq 0 ]
  [[ "$output" == *"Verified release 0.1.0 against SHA256SUMS."* ]]
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/web/app/index.html" ]
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/web/app/assets/app.js" ]
}

@test "install.sh engine mode accepts the bundle and finds the model" {
  bundle >/dev/null
  RELEASE="$T/out"
  export RELEASE
  installer
  [ "$status" -eq 0 ]
  [[ "$output" == *"Verified release 0.1.0 against SHA256SUMS."* ]]
  grep -q "MODEL_ID=pro-test DOPPELGANGER_MODELS=$XDG_DATA_HOME/doppelganger/0.1.0" "$CALLS"
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/pro-test.fp32.onnx" ]
}

@test "a file changed after bundling ends in the installer's integrity error" {
  bundle >/dev/null
  printf 'tampered\n' >"$T/out/pro-test.fp32.onnx"
  RELEASE="$T/out"
  export RELEASE
  installer
  [ "$status" -eq 2 ]
  [[ "$output" == *"integrity error"* ]]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0" ]
}

@test "a test model is refused unless the dry run allows it" {
  make_model ci-test test
  rm "$FIX/models/pro-test.json" "$FIX/models/pro-test.fp32.onnx"
  run bundle
  [ "$status" -eq 1 ]
  [[ "$output" == *"a test model can't be released"* ]]
  [ ! -e "$T/out/SHA256SUMS" ]
  run bundle --allow-test-model
  [ "$status" -eq 0 ]
}

@test "a manifest that does not match its model file is refused" {
  printf 'swapped\n' >"$FIX/models/pro-test.fp32.onnx"
  run bundle
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not match the SHA-256 or size in its manifest"* ]]
}

@test "a missing model file, an empty models folder and bad options are refused" {
  rm "$FIX/models/pro-test.fp32.onnx"
  run bundle
  [ "$status" -eq 1 ]
  [[ "$output" == *"not found next to it"* ]]
  rm "$FIX/models/pro-test.json"
  run bundle
  [ "$status" -eq 1 ]
  [[ "$output" == *"no model manifest"* ]]
  run "$BUNDLE" --version 1.0 --web-dir "$FIX/web" --models "$FIX/models" --out "$T/out"
  [ "$status" -eq 1 ]
  run "$BUNDLE" --bogus
  [ "$status" -eq 1 ]
  run "$BUNDLE" --version 0.1.0 --web-dir "$T/nowhere" --models "$FIX/models" --out "$T/out"
  [ "$status" -eq 1 ]
  [[ "$output" == *"must hold a web build"* ]]
}

@test "release-build refuses a version that is not the installer's, before building" {
  run "$SCRIPTS/release-build.sh" --version 9.9.9 --out "$T/out" --models "$FIX/models"
  [ "$status" -eq 1 ]
  [[ "$output" == *"is not the installer's VERSION"* ]]
  [ ! -e "$T/out" ]
}

# The dry-run job of release.yml builds the real web app and points this at the result.
@test "install.sh accepts the bundle that the workflow built (RELEASE_BUNDLE_DIR)" {
  if [ -z "${RELEASE_BUNDLE_DIR:-}" ]; then
    skip "RELEASE_BUNDLE_DIR is not set (the release dry-run job sets it)"
  fi
  RELEASE="$RELEASE_BUNDLE_DIR"
  export RELEASE
  installer --static
  [ "$status" -eq 0 ]
  [[ "$output" == *"Verified release"* ]]
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/web/app/index.html" ]
  installer --stop
  rm -rf "$XDG_DATA_HOME/doppelganger/0.1.0"
  installer
  [ "$status" -eq 0 ]
  [[ "$output" == *"Verified release"* ]]
}
