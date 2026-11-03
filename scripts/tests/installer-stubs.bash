# Shared stubs for the installer's Bats tests (install.bats, release.bats; design P35, P45).
# No Docker, no network: docker, curl, ss, df, uname, python3 and sleep are stubs on a PATH
# that holds only the real tools the installer needs, so a tool can be made "missing".
# Call `install_stubs` from setup(); it sets T, RELEASE (where the curl stub serves
# https:// files from), STATE, CALLS and PATH.

install_stubs() {
  T="$BATS_TEST_TMPDIR"
  export XDG_DATA_HOME="$T/data" STATE="$T/state" RELEASE="$T/release" CALLS="$T/calls"
  export DOPPELGANGER_PROC_VERSION="$T/proc_version" DOPPELGANGER_HEALTH_TIMEOUT=3
  mkdir -p "$STATE" "$RELEASE" "$T/bin" "$T/real"
  : >"$CALLS"
  echo "Linux version 6.8.0-generic" >"$DOPPELGANGER_PROC_VERSION"

  for tool in sh awk sed grep cat cut mkdir rm mv ln dirname basename head tail touch tar gzip ps nohup sha256sum env; do
    ln -s "$(command -v "$tool")" "$T/real/$tool"
  done
  stub docker <<'EOF'
echo "docker $*" >>"$CALLS"
case "$*" in
  "compose version") [ -z "${NO_COMPOSE:-}" ] ;;
  *" ps -q") [ -f "$STATE/running" ] && echo 0123abcd; exit 0 ;;
  *" up -d --build")
    echo "MODEL_ID=$MODEL_ID DOPPELGANGER_MODELS=$DOPPELGANGER_MODELS" >>"$CALLS"
    touch "$STATE/running" ;;
  *" logs --no-log-prefix engine")
    echo '{"event":"engine_starting"}'
    echo "Doppelgänger engine ready: http://127.0.0.1:8787/app/#token=stub-token" ;;
  *" stop" | *" down --remove-orphans") rm -f "$STATE/running" ;;
  "image rm doppelganger-engine:local") ;;
  *) echo "unexpected docker call: $*" >&2; exit 99 ;;
esac
EOF
  stub curl <<'EOF'
for out in "$@"; do :; done
url="$out"; target=""
while [ "$#" -gt 1 ]; do [ "$1" = "-o" ] && target="$2"; shift; done
case "$url" in
  http://127.0.0.1:*/healthz) [ -f "$STATE/running" ] && [ -z "${HEALTH_FAIL:-}" ] ;;
  https://*)
    echo "curl $(basename "$url")" >>"$CALLS"
    echo "url $url" >>"$CALLS"
    [ -f "$RELEASE/$(basename "$url")" ] && cat "$RELEASE/$(basename "$url")" >"$target" ;;
  *) exit 22 ;;
esac
EOF
  stub ss '[ -f "$STATE/port_busy" ] && echo "LISTEN 0 4096 127.0.0.1:8787 0.0.0.0:*"; exit 0'
  stub df 'echo "Filesystem 1024-blocks Used Available Capacity Mounted"; echo "/dev/x 1 1 ${DF_AVAIL:-99999999} 1% /"'
  stub uname 'echo "${UNAME:-Linux}"'
  stub python3 'while :; do /bin/sleep 1; done'
  stub sleep ':'
  export PATH="$T/bin:$T/real"
}

# stub NAME [BODY]: write an executable stub; the body comes from $2 or stdin.
stub() {
  { echo '#!/bin/sh'; if [ "$#" -ge 2 ]; then echo "$2"; else cat; fi; } >"$T/bin/$1"
  chmod +x "$T/bin/$1"
}

hide() { rm -f "$T/real/$1" "$T/bin/$1"; }
