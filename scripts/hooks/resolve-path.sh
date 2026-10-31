#!/usr/bin/env bash
# Shared helper for hook scripts: print a hook's target file path relative to the repo root.
# Source it, then call: rel="$(hook_path "$@")"
# The path comes from the first argument ({{filePath}}) or, failing that, from the
# hook event JSON on STDIN (file_path, path or tool_input.path).

hook_path() {
  local raw="${1:-}"
  if [[ -z "$raw" && ! -t 0 ]]; then
    raw="$(python3 -c 'import json,sys
try:
    e=json.load(sys.stdin)
except Exception:
    sys.exit(0)
t=e.get("tool_input") if isinstance(e.get("tool_input"),dict) else {}
print(e.get("file_path") or e.get("path") or t.get("path") or "")')"
  fi
  [[ -z "$raw" ]] && return 1
  local root
  root="$(git rev-parse --show-toplevel)"
  realpath -m --relative-to="$root" "$raw"
}
