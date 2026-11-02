#!/bin/sh
# Doppelgänger local runtime installer (local-runtime Requirement 6, design P35).
#
#   scripts/install.sh                 Engine_Mode: verify the release, start the engine with Compose
#   scripts/install.sh --static        Static mode: verify and serve the web app with python3
#   scripts/install.sh --stop | --status | --uninstall
#   scripts/install.sh --version X.Y.Z (with any of the above)
#
# Linux and WSL2. macOS is untested. Never uses sudo, never installs system packages, and
# writes only inside this repository's Compose project and ${XDG_DATA_HOME:-$HOME/.local/share}/doppelganger.
#
# Exit codes: 0 ok, 1 prerequisites or usage, 2 integrity, 3 download, 4 engine not healthy.
set -eu

VERSION="0.1.0"
REPO_URL="https://github.com/brennocm/doppelganger"
PROJECT="doppelganger"
IMAGE="doppelganger-engine:local"
PORT="${DOPPELGANGER_PORT:-8787}"
STATIC_PORT="${DOPPELGANGER_STATIC_PORT:-8788}"
HEALTH_TIMEOUT="${DOPPELGANGER_HEALTH_TIMEOUT:-60}"
PROC_VERSION="${DOPPELGANGER_PROC_VERSION:-/proc/version}"
DATA_DIR="${XDG_DATA_HOME:-${HOME:?HOME is not set}/.local/share}/doppelganger"
ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/compose.yaml"
ENGINE_KIB=$((2 * 1024 * 1024))
STATIC_KIB=$((200 * 1024))

say() { printf '%s\n' "$*"; }
err() { printf 'install: %s\n' "$*" >&2; }
die() {
  code="$1"
  shift
  err "$*"
  exit "$code"
}

usage() {
  say "usage: scripts/install.sh [--static | --stop | --status | --uninstall] [--version X.Y.Z]"
}

# --- arguments ----------------------------------------------------------------------------

ACTION="engine"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --static) ACTION="static" ;;
    --stop) ACTION="stop" ;;
    --status) ACTION="status" ;;
    --uninstall) ACTION="uninstall" ;;
    --version)
      [ "$#" -ge 2 ] || die 1 "--version needs a value"
      VERSION="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die 1 "unknown option: $1"
      ;;
  esac
  shift
done

if ! printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  die 1 "version must look like X.Y.Z"
fi
for port in "$PORT" "$STATIC_PORT" "$HEALTH_TIMEOUT"; do
  if ! printf '%s\n' "$port" | grep -Eq '^[0-9]{1,5}$'; then
    die 1 "ports and DOPPELGANGER_HEALTH_TIMEOUT must be numbers"
  fi
done

RELEASE_URL="${DOPPELGANGER_RELEASE_URL:-$REPO_URL/releases/download/v$VERSION}"
case "$RELEASE_URL" in
  https://*) ;;
  *) die 1 "DOPPELGANGER_RELEASE_URL must start with https://" ;;
esac
RELEASE_DIR="$DATA_DIR/$VERSION"
PARTIAL_DIR="$DATA_DIR/$VERSION.partial"
PID_FILE="$DATA_DIR/static.pid"

# --- platform and prerequisites -----------------------------------------------------------

check_platform() {
  case "$(uname -s)" in
    Linux)
      if [ -r "$PROC_VERSION" ] && grep -qi microsoft "$PROC_VERSION"; then
        say "Platform: WSL2"
      else
        say "Platform: Linux"
      fi
      ;;
    Darwin) say "Platform: macOS is untested; continuing." ;;
    *) die 1 "unsupported platform: $(uname -s) (Linux and WSL2 only)" ;;
  esac
}

MISSING=0
missing() {
  err "missing: $1"
  MISSING=1
}

have() { command -v "$1" >/dev/null 2>&1; }

engine_running() {
  have docker && [ -n "$(compose ps -q 2>/dev/null || true)" ]
}

check_port() {
  if ! have ss; then
    say "Notice: 'ss' not found; skipping the free-port check for $1."
    return 0
  fi
  if [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null || true)" ]; then
    missing "a free port $1 (set ${2} to use another port)"
  fi
}

check_disk() {
  mkdir -p "$DATA_DIR"
  avail="$(df -Pk "$DATA_DIR" | awk 'NR == 2 { print $4 }')"
  case "$avail" in
    '' | *[!0-9]*) missing "free disk space (could not read df output)" ;;
    *) [ "$avail" -ge "$1" ] || missing "$(($1 / 1024)) MiB of free disk space in $DATA_DIR" ;;
  esac
}

check_common() {
  have curl || have wget ||
    missing "curl or wget (https://curl.se/download.html)"
  have sha256sum ||
    missing "sha256sum, from GNU coreutils (https://www.gnu.org/software/coreutils/)"
  have tar || missing "tar (https://www.gnu.org/software/tar/)"
}

check_engine_prerequisites() {
  if ! have docker; then
    missing "Docker. Install it from https://docs.docker.com/engine/install/ (Linux) or enable Docker in WSL2, then run this again."
  elif ! docker compose version >/dev/null 2>&1; then
    missing "Docker Compose v2 (https://docs.docker.com/compose/install/)"
  fi
  check_common
  check_disk "$ENGINE_KIB"
  if ! engine_running; then
    check_port "$PORT" DOPPELGANGER_PORT
  fi
  [ "$MISSING" -eq 0 ] || exit 1
}

check_static_prerequisites() {
  have python3 || missing "python3 (https://www.python.org/downloads/)"
  check_common
  check_disk "$STATIC_KIB"
  if ! static_running; then
    check_port "$STATIC_PORT" DOPPELGANGER_STATIC_PORT
  fi
  [ "$MISSING" -eq 0 ] || exit 1
}

# --- download and verification ------------------------------------------------------------

fetch() {
  if have curl; then
    curl -fsSL --proto '=https' --tlsv1.2 -o "$2" "$1"
  else
    wget -q --https-only -O "$2" "$1"
  fi
}

discard() {
  rm -rf -- "$PARTIAL_DIR"
  die "$1" "$2"
}

# Prints the file names this mode needs, one per line, from a SHA256SUMS file.
wanted_files() {
  awk '{ print $2 }' "$1" | sed 's/^\*//' | while IFS= read -r name; do
    case "$name" in
      doppelganger-web-*.tar.gz) [ "$ACTION" != "static" ] || printf '%s\n' "$name" ;;
      *.onnx | *.json) [ "$ACTION" != "engine" ] || printf '%s\n' "$name" ;;
    esac
  done
}

# Lines of SHA256SUMS for the wanted files only, so sha256sum -c checks exactly those.
verify_dir() {
  dir="$1"
  wanted="$(wanted_files "$dir/SHA256SUMS")"
  [ -n "$wanted" ] || return 1
  printf '%s\n' "$wanted" | while IFS= read -r name; do
    awk -v n="$name" '$2 == n || $2 == "*" n' "$dir/SHA256SUMS"
  done >"$dir/.wanted.sums"
  (cd "$dir" && sha256sum -c --quiet --strict .wanted.sums >/dev/null 2>&1)
}

download_release() {
  if [ -f "$RELEASE_DIR/SHA256SUMS" ] && verify_dir "$RELEASE_DIR" 2>/dev/null; then
    say "Release $VERSION already downloaded and verified."
    return 0
  fi
  rm -rf -- "$PARTIAL_DIR"
  mkdir -p "$PARTIAL_DIR"
  fetch "$RELEASE_URL/SHA256SUMS" "$PARTIAL_DIR/SHA256SUMS" ||
    discard 3 "could not download SHA256SUMS for $VERSION from $RELEASE_URL"
  if awk '{ print $2 }' "$PARTIAL_DIR/SHA256SUMS" | sed 's/^\*//' | grep -Ev '^[A-Za-z0-9._-]+$' | grep -q .; then
    discard 2 "integrity error: SHA256SUMS lists an unsafe file name"
  fi
  if [ -z "$(wanted_files "$PARTIAL_DIR/SHA256SUMS")" ]; then
    discard 2 "integrity error: SHA256SUMS lists no file for $ACTION mode"
  fi
  for name in $(wanted_files "$PARTIAL_DIR/SHA256SUMS"); do
    say "Downloading $name"
    fetch "$RELEASE_URL/$name" "$PARTIAL_DIR/$name" ||
      discard 3 "could not download $name"
  done
  verify_dir "$PARTIAL_DIR" ||
    discard 2 "integrity error: a downloaded file does not match SHA256SUMS; nothing was kept"
  if [ -d "$RELEASE_DIR" ]; then
    # Keep the other mode's verified files: move the new ones in next to them.
    for name in SHA256SUMS $(wanted_files "$PARTIAL_DIR/SHA256SUMS"); do
      mv -f -- "$PARTIAL_DIR/$name" "$RELEASE_DIR/$name"
    done
    rm -rf -- "$PARTIAL_DIR"
  else
    mv -- "$PARTIAL_DIR" "$RELEASE_DIR"
  fi
  say "Verified release $VERSION against SHA256SUMS."
}

# --- engine mode --------------------------------------------------------------------------

compose() {
  DOPPELGANGER_MODELS="$RELEASE_DIR" MODEL_ID="${MODEL_ID:-unset}" DOPPELGANGER_PORT="$PORT" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
}

start_engine() {
  MODEL_ID=""
  for name in $(wanted_files "$RELEASE_DIR/SHA256SUMS"); do
    case "$name" in *.json) MODEL_ID="${name%.json}" ;; esac
  done
  [ -n "$MODEL_ID" ] || die 2 "integrity error: the release has no model manifest"
  say "Starting the engine (the first run builds the image, which takes a few minutes)."
  compose up -d --build >/dev/null || die 4 "docker compose up failed"
  waited=0
  until fetch_health; do
    waited=$((waited + 1))
    [ "$waited" -lt "$HEALTH_TIMEOUT" ] ||
      die 4 "the engine did not become healthy within ${HEALTH_TIMEOUT}s; see: docker compose -p $PROJECT logs"
    sleep 1
  done
  url="$(compose logs --no-log-prefix engine 2>/dev/null | sed -n 's/^Doppelgänger engine ready: //p' | tail -n 1)"
  [ -n "$url" ] || die 4 "the engine is healthy but printed no launch URL; see: docker compose -p $PROJECT logs"
  say "Open: $url"
}

fetch_health() {
  if have curl; then
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null
  else
    wget -q -O /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null
  fi
}

# --- static mode --------------------------------------------------------------------------

static_running() {
  [ -f "$PID_FILE" ] || return 1
  pid="$(cat "$PID_FILE")"
  case "$pid" in '' | *[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null && ps -o args= -p "$pid" 2>/dev/null | grep -q 'http.server'
}

start_static() {
  if static_running; then
    say "Already serving: http://127.0.0.1:$STATIC_PORT/app/"
    return 0
  fi
  tarball=""
  for name in $(wanted_files "$RELEASE_DIR/SHA256SUMS"); do tarball="$name"; done
  web="$RELEASE_DIR/web"
  rm -rf -- "$web"
  mkdir -p "$web/app"
  tar -xzf "$RELEASE_DIR/$tarball" -C "$web/app" --no-same-owner --no-same-permissions ||
    die 2 "integrity error: could not unpack $tarball"
  nohup python3 -m http.server "$STATIC_PORT" --bind 127.0.0.1 --directory "$web" \
    >"$DATA_DIR/static.log" 2>&1 &
  printf '%s\n' "$!" >"$PID_FILE"
  say "Open: http://127.0.0.1:$STATIC_PORT/app/"
}

stop_static() {
  if static_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    say "Stopped the static server."
  fi
  rm -f -- "$PID_FILE"
}

# --- stop, status, uninstall --------------------------------------------------------------

do_stop() {
  if engine_running; then
    compose stop >/dev/null
    say "Stopped the engine."
  fi
  stop_static
}

do_status() {
  if engine_running; then say "Engine: running (port $PORT)"; else say "Engine: not running"; fi
  if static_running; then
    say "Static: serving http://127.0.0.1:$STATIC_PORT/app/"
  else
    say "Static: not running"
  fi
}

do_uninstall() {
  say "This removes the $PROJECT containers, the $IMAGE image and $DATA_DIR."
  printf 'Type yes to continue: '
  answer=""
  read -r answer || true
  [ "$answer" = "yes" ] || die 1 "uninstall cancelled"
  if have docker; then
    compose down --remove-orphans >/dev/null 2>&1 || true
    docker image rm "$IMAGE" >/dev/null 2>&1 || true
  fi
  stop_static
  case "$DATA_DIR" in
    */doppelganger) rm -rf -- "$DATA_DIR" ;;
    *) die 1 "refusing to delete $DATA_DIR (it does not end in /doppelganger)" ;;
  esac
  say "Uninstalled."
}

# --- main ---------------------------------------------------------------------------------

case "$ACTION" in
  stop) do_stop ;;
  status) do_status ;;
  uninstall) do_uninstall ;;
  engine)
    check_platform
    check_engine_prerequisites
    download_release
    start_engine
    ;;
  static)
    check_platform
    check_static_prerequisites
    download_release
    start_static
    ;;
esac
