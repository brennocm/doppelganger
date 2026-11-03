#!/usr/bin/env bash
# Release gate for the submission (submission task 1.3, design P48). Run it from anywhere
# inside the repository, by hand, before submitting:
#
#   scripts/release-check.sh                 # builds dist/pages, then runs every check
#   scripts/release-check.sh --dist DIR      # check an existing Pages build instead
#   scripts/release-check.sh --offline       # skip the public URL check (and say so)
#
# Every check runs even after a failure. Each problem is one "release-check: FAIL" line, and
# the exit status is 1 if anything failed. It is deliberately NOT part of `mise run check`
# or `check:all`: those stay green while PENDING-GATE markers wait for the go/no-go gate.
set -uo pipefail

MARKER="PENDING-GATE"
REPO_URL="https://github.com/brennocm/doppelganger"
DEMO_URL="https://brennocm.github.io/doppelganger/"

dist=""
offline=0
while (($# > 0)); do
  case "$1" in
    --dist)
      dist="${2:-}"
      shift 2 || {
        echo "release-check: --dist needs a folder" >&2
        exit 2
      }
      ;;
    --offline)
      offline=1
      shift
      ;;
    *)
      echo "release-check: unknown option '$1'" >&2
      exit 2
      ;;
  esac
done

root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "release-check: not inside a git repository" >&2
  exit 2
}
cd "$root" || exit 2

failures=0
fail() {
  echo "release-check: FAIL $1: $2"
  failures=$((failures + 1))
}
pass() {
  echo "release-check: ok   $1"
}

# 1. Pending markers in tracked files. These paths define, detect or quote the marker and
#    are skipped, each for the reason given:
skip=(
  ':!docs/prompt-history.md'          # verbatim prompts that ask for the marker
  ':!docs/kiro-journal.md'            # the log of what was done, quotes included
  ':!.kiro/specs/'                    # specs describe where the marker goes
  ':!scripts/release-check.sh'        # this check
  ':!scripts/tests/release-check.bats' # its test plants markers on purpose
  ':!apps/landing/src/content.ts'     # the landing's only marker reader (P46)
  ':!apps/landing/src/content.test.ts'
  ':!*/e2e/*'                         # test code and fixtures, never built into Pages
)
if hits="$(git grep -n -I -F "$MARKER" -- . "${skip[@]}")"; then
  while IFS=: read -r file line _; do
    fail "pending" "$file:$line"
  done <<<"$hits"
else
  pass "pending markers in tracked files"
fi

# 2. Pending markers in the built output.
if [[ -z "$dist" ]]; then
  dist="dist/pages"
  if ! scripts/build-pages.sh >/dev/null 2>&1; then
    fail "build" "scripts/build-pages.sh failed; run it to see why"
  fi
fi
built=0
for dir in "$dist" release; do
  [[ -d "$dir" ]] || continue
  built=1
  if hits="$(grep -rIl -F "$MARKER" "$dir")"; then
    while IFS= read -r hit; do fail "pending-built" "$hit"; done <<<"$hits"
  else
    pass "pending markers in $dir/"
  fi
done
((built)) || fail "pending-built" "no build output at $dist"

# 3. License: MIT, so GitHub detects it (Requirement 1.1).
if [[ -f LICENSE ]] && grep -q '^MIT License' LICENSE; then
  pass "license"
else
  fail "license" "LICENSE is missing or is not the MIT license"
fi

# 4. Kiro files are tracked and not ignored (Requirement 1.2).
if [[ -n "$(git ls-files .kiro | head -n 1)" ]] && ! git check-ignore -q .kiro; then
  pass ".kiro/ tracked"
else
  fail "kiro" ".kiro/ is not tracked, or is git-ignored"
fi

# 5. No secrets in the full history (Requirement 1.4).
if gitleaks git --redact --no-banner . >/dev/null 2>&1; then
  pass "gitleaks (full history)"
else
  fail "secrets" "gitleaks found leaks; run 'mise run secrets:history' to see them"
fi

# 6. Public URLs answer an anonymous request (Requirement 4.3).
if ((offline)); then
  echo "release-check: skip public URLs (--offline)"
else
  urls=("$REPO_URL" "$DEMO_URL" "${DEMO_URL}app/")
  video="$(sed -n 's/.*"videoId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' apps/landing/content.json 2>/dev/null)"
  if [[ -n "$video" && "$video" != "$MARKER" ]]; then
    urls+=("https://www.youtube.com/watch?v=$video")
  fi
  for url in "${urls[@]}"; do
    # -q: ignore any ~/.curlrc; no credentials are ever passed.
    code="$(curl -q -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null)"
    if [[ "$code" == "200" ]]; then
      pass "$url"
    else
      fail "url" "$url answered ${code:-nothing}"
    fi
  done
fi

if ((failures == 0)); then
  echo "release-check: ready, 0 problems"
  exit 0
fi
echo "release-check: NOT ready, $failures problem(s)"
exit 1
