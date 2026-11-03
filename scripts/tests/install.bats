#!/usr/bin/env bats
# scripts/install.sh with stubbed commands (local-runtime task 6.4, design P35).
# No Docker, no network: docker, curl, ss, df, uname, python3 and sleep are stubs on a PATH
# that holds only the real tools the installer needs, so a tool can be made "missing".

INSTALL="$BATS_TEST_DIRNAME/../install.sh"
load installer-stubs

setup() {
  install_stubs

  printf 'model bytes\n' >"$RELEASE/pro-test.fp32.onnx"
  printf '{"id":"pro-test"}\n' >"$RELEASE/pro-test.json"
  mkdir -p "$T/web" && printf '<!doctype html>\n' >"$T/web/index.html"
  tar -czf "$RELEASE/doppelganger-web-0.1.0.tar.gz" -C "$T/web" index.html
  (cd "$RELEASE" && sha256sum pro-test.fp32.onnx pro-test.json doppelganger-web-0.1.0.tar.gz >SHA256SUMS)
}

teardown() {
  if [ -f "$XDG_DATA_HOME/doppelganger/static.pid" ]; then
    kill "$(cat "$XDG_DATA_HOME/doppelganger/static.pid")" 2>/dev/null || true
  fi
}

@test "the installer never calls sudo and is POSIX sh" {
  run grep -nE '(^|[^#]*[;&|[:space:]])sudo([[:space:]]|$)' "$INSTALL"
  [ "$status" -eq 1 ]
  [ "$(head -n 1 "$INSTALL")" = "#!/bin/sh" ]
}

@test "missing Docker is reported with the official link, together with other gaps" {
  hide docker
  hide sha256sum
  run "$INSTALL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker. Install it from https://docs.docker.com/engine/install/"* ]]
  [[ "$output" == *"sha256sum, from GNU coreutils"* ]]
  [ ! -d "$XDG_DATA_HOME/doppelganger/0.1.0" ]
}

@test "missing Compose v2 is reported" {
  NO_COMPOSE=1 run "$INSTALL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker Compose v2 (https://docs.docker.com/compose/install/)"* ]]
}

@test "a busy port, low disk space and no downloader are reported" {
  touch "$STATE/port_busy"
  hide curl
  DF_AVAIL=1024 run "$INSTALL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"a free port 8787"* ]]
  [[ "$output" == *"2048 MiB of free disk space"* ]]
  [[ "$output" == *"curl or wget"* ]]
}

@test "static mode needs python3 but not Docker" {
  hide docker
  hide python3
  run "$INSTALL" --static
  [ "$status" -eq 1 ]
  [[ "$output" == *"python3 (https://www.python.org/downloads/)"* ]]
  [[ "$output" != *"Docker"* ]]
}

@test "WSL2 is detected, macOS is untested, other systems are refused" {
  echo "Linux version 6.6.87-microsoft-standard-WSL2" >"$DOPPELGANGER_PROC_VERSION"
  hide docker
  run "$INSTALL"
  [[ "$output" == *"Platform: WSL2"* ]]
  UNAME=Darwin run "$INSTALL"
  [[ "$output" == *"macOS is untested"* ]]
  UNAME=FreeBSD run "$INSTALL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unsupported platform: FreeBSD"* ]]
}

@test "engine mode verifies the release, starts Compose and prints the launch URL" {
  run "$INSTALL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Verified release 0.1.0 against SHA256SUMS."* ]]
  [[ "$output" == *"Open: http://127.0.0.1:8787/app/#token=stub-token"* ]]
  grep -q "MODEL_ID=pro-test DOPPELGANGER_MODELS=$XDG_DATA_HOME/doppelganger/0.1.0" "$CALLS"
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/pro-test.fp32.onnx" ]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0/doppelganger-web-0.1.0.tar.gz" ]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0.partial" ]
}

@test "running twice reuses the verified release and leaves one instance" {
  run "$INSTALL"
  [ "$status" -eq 0 ]
  run "$INSTALL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"already downloaded and verified"* ]]
  [ "$(grep -c '^curl pro-test.fp32.onnx$' "$CALLS")" -eq 1 ]
  [ "$(grep -c ' up -d --build$' "$CALLS")" -eq 2 ]
  [ -f "$STATE/running" ]
}

@test "a checksum mismatch deletes the downloads and exits with an integrity error" {
  printf 'tampered\n' >"$RELEASE/pro-test.fp32.onnx"
  run "$INSTALL"
  [ "$status" -eq 2 ]
  [[ "$output" == *"integrity error"* ]]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0.partial" ]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0" ]
  ! grep -q ' up -d' "$CALLS"
}

@test "a tampered cached release is downloaded again, not trusted" {
  run "$INSTALL"
  printf 'tampered\n' >"$XDG_DATA_HOME/doppelganger/0.1.0/pro-test.fp32.onnx"
  run "$INSTALL"
  [ "$status" -eq 0 ]
  [ "$(grep -c '^curl pro-test.fp32.onnx$' "$CALLS")" -eq 2 ]
  [ "$(cat "$XDG_DATA_HOME/doppelganger/0.1.0/pro-test.fp32.onnx")" = "model bytes" ]
}

@test "unsafe file names in SHA256SUMS are refused before any download" {
  echo "0000000000000000000000000000000000000000000000000000000000000000  ../evil.json" >>"$RELEASE/SHA256SUMS"
  run "$INSTALL"
  [ "$status" -eq 2 ]
  [[ "$output" == *"unsafe file name"* ]]
  ! grep -q '^curl pro-test' "$CALLS"
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0.partial" ]
}

@test "a missing asset exits with a download error and keeps nothing" {
  rm "$RELEASE/pro-test.json"
  run "$INSTALL"
  [ "$status" -eq 3 ]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0.partial" ]
}

@test "an engine that never becomes healthy exits 4" {
  HEALTH_FAIL=1 run "$INSTALL"
  [ "$status" -eq 4 ]
  [[ "$output" == *"did not become healthy within 3s"* ]]
}

@test "static mode serves the unpacked app once, and --stop stops it" {
  run "$INSTALL" --static
  [ "$status" -eq 0 ]
  [[ "$output" == *"Open: http://127.0.0.1:8788/app/"* ]]
  [ -f "$XDG_DATA_HOME/doppelganger/0.1.0/web/app/index.html" ]
  pid="$(cat "$XDG_DATA_HOME/doppelganger/static.pid")"
  kill -0 "$pid"
  run "$INSTALL" --static
  [ "$status" -eq 0 ]
  [[ "$output" == *"Already serving"* ]]
  [ "$(cat "$XDG_DATA_HOME/doppelganger/static.pid")" = "$pid" ]
  run "$INSTALL" --status
  [[ "$output" == *"Static: serving http://127.0.0.1:8788/app/"* ]]
  [[ "$output" == *"Engine: not running"* ]]
  run "$INSTALL" --stop
  [ "$status" -eq 0 ]
  [[ "$output" == *"Stopped the static server."* ]]
  ! kill -0 "$pid" 2>/dev/null
}

@test "--stop and --status cover the engine" {
  run "$INSTALL"
  run "$INSTALL" --status
  [[ "$output" == *"Engine: running (port 8787)"* ]]
  run "$INSTALL" --stop
  [[ "$output" == *"Stopped the engine."* ]]
  [ ! -f "$STATE/running" ]
}

@test "--uninstall needs the word yes, then removes containers, image and data" {
  run "$INSTALL"
  run "$INSTALL" --uninstall <<<"no"
  [ "$status" -eq 1 ]
  [ -d "$XDG_DATA_HOME/doppelganger" ]
  run "$INSTALL" --uninstall <<<"yes"
  [ "$status" -eq 0 ]
  grep -q ' down --remove-orphans$' "$CALLS"
  grep -q '^docker image rm doppelganger-engine:local$' "$CALLS"
  [ ! -e "$XDG_DATA_HOME/doppelganger" ]
  [ -d "$XDG_DATA_HOME" ]
}

@test "bad versions and options are refused" {
  run "$INSTALL" --version 1.0
  [ "$status" -eq 1 ]
  run "$INSTALL" --version '1.0.0;rm'
  [ "$status" -eq 1 ]
  run "$INSTALL" --bogus
  [ "$status" -eq 1 ]
}

@test "the release URL cannot be redirected through the environment" {
  DOPPELGANGER_RELEASE_URL=https://evil.example run "$INSTALL"
  [ "$status" -eq 0 ]
  grep -q '^url https://github.com/brennocm/doppelganger/releases/download/v0.1.0/SHA256SUMS$' "$CALLS"
  ! grep -q 'evil.example' "$CALLS"
}

@test "a web tarball with a symlink is refused before unpacking" {
  ln -s /etc/passwd "$T/web/k"
  tar -czf "$RELEASE/doppelganger-web-0.1.0.tar.gz" -C "$T/web" index.html k
  (cd "$RELEASE" && sha256sum pro-test.fp32.onnx pro-test.json doppelganger-web-0.1.0.tar.gz >SHA256SUMS)
  run "$INSTALL" --static
  [ "$status" -eq 2 ]
  [[ "$output" == *"contains links or special files"* ]]
  [ ! -e "$XDG_DATA_HOME/doppelganger/0.1.0/web" ]
  [ ! -f "$XDG_DATA_HOME/doppelganger/static.pid" ]
}

@test "--uninstall refuses a data folder the installer did not create" {
  mkdir -p "$XDG_DATA_HOME/doppelganger"
  echo keep >"$XDG_DATA_HOME/doppelganger/precious"
  run "$INSTALL" --uninstall <<<"yes"
  [ "$status" -eq 1 ]
  [[ "$output" == *"the installer did not create it"* ]]
  [ -f "$XDG_DATA_HOME/doppelganger/precious" ]
  ! grep -q ' down ' "$CALLS"
  XDG_DATA_HOME=relative/dir run "$INSTALL" --uninstall <<<"yes"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not an absolute path"* ]]
}

@test "--stop never kills a process that only looks like a static server" {
  mkdir -p "$XDG_DATA_HOME/doppelganger"
  "$T/bin/python3" -m http.server 9999 &
  other=$!
  echo "$other" >"$XDG_DATA_HOME/doppelganger/static.pid"
  run "$INSTALL" --stop
  [ "$status" -eq 0 ]
  kill -0 "$other"
  kill "$other"
}
