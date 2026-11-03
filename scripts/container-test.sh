#!/usr/bin/env bash
# CI container test (local-runtime task 5.3, design P43).
#
#   scripts/container-test.sh
#
# Builds and starts the engine with the real Compose file and the committed synthetic CI
# model, checks the hardening with `docker inspect`, runs one WebSocket session and tears
# everything down. Needs Docker with Compose v2; without it this fails instead of skipping.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
project="doppelganger-ci"
port="18787"
compose_file="$root/infra/docker/compose.yaml"
export DOPPELGANGER_MODELS="$root/apps/web/public/models"
export MODEL_ID="ci-synthetic-linear"
export DOPPELGANGER_PORT="$port"

fail() {
  echo "container-test: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker not found (this test never skips)"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 not found"

compose() { docker compose -p "$project" -f "$compose_file" "$@"; }

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    # The engine's JSON logs, without the one line that carries the session token.
    compose logs --no-color --tail 200 2>&1 | grep -v 'engine ready:' >&2 || true
  fi
  compose down --remove-orphans --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "container-test: build and start"
compose up -d --build

echo "container-test: wait for /healthz"
for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/healthz" | grep -q '"status":"ok"' || fail "engine not healthy"

id="$(compose ps -q engine)"
[[ -n "$id" ]] || fail "no engine container"

check() {
  local what="$1" format="$2" expected="$3" actual
  actual="$(docker inspect --format "$format" "$id")"
  [[ "$actual" == "$expected" ]] || fail "$what: expected '$expected', got '$actual'"
  echo "container-test: ok $what"
}

check "read-only root filesystem" '{{.HostConfig.ReadonlyRootfs}}' "true"
check "all capabilities dropped" '{{json .HostConfig.CapDrop}}' '["ALL"]'
check "no new privileges" '{{json .HostConfig.SecurityOpt}}' '["no-new-privileges:true"]'
check "non-root user" '{{.Config.User}}' "10001:10001"
# Go template variables, not shell expansions.
# shellcheck disable=SC2016
check "loopback-only port" \
  '{{range $p, $b := .HostConfig.PortBindings}}{{$p}}={{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' \
  "8787/tcp=127.0.0.1:$port "
check "read-only model volume" \
  '{{range .Mounts}}{{if eq .Destination "/models"}}{{.RW}}{{end}}{{end}}' "false"

tmpfs="$(docker inspect --format '{{index .HostConfig.Tmpfs "/tmp"}}' "$id")"
[[ "$tmpfs" == *noexec* && "$tmpfs" == *nosuid* ]] || fail "/tmp tmpfs options: '$tmpfs'"
echo "container-test: ok /tmp tmpfs ($tmpfs)"

memory="$(docker inspect --format '{{.HostConfig.Memory}}' "$id")"
cpus="$(docker inspect --format '{{.HostConfig.NanoCpus}}' "$id")"
[[ "$memory" -gt 0 && "$cpus" -gt 0 ]] || fail "limits: memory=$memory nanocpus=$cpus"
echo "container-test: ok memory and CPU limits"

url="$(compose logs --no-log-prefix engine 2>/dev/null | sed -n 's/^Doppelgänger engine ready: //p' | tail -n 1)"
[[ "$url" == "http://127.0.0.1:$port/app/#token="* ]] || fail "no launch URL in the logs"

echo "container-test: stream session"
uv run --locked python "$root/scripts/container_stream_check.py" "$url"
echo "container-test: all checks passed"
