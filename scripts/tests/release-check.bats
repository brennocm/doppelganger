#!/usr/bin/env bats
# scripts/release-check.sh (release task 1.3, design P48). Each test runs the check in a
# throwaway git repository with stub gitleaks and curl on PATH: no network, no real scan.

CHECK="$BATS_TEST_DIRNAME/../release-check.sh"

setup() {
  T="$BATS_TEST_TMPDIR"
  REPO="$T/repo"
  mkdir -p "$T/bin" "$REPO/.kiro/steering" "$REPO/apps/landing" "$REPO/dist/pages/app"
  cat >"$T/bin/gitleaks" <<'EOF'
#!/bin/sh
[ -z "${LEAKS:-}" ]
EOF
  cat >"$T/bin/curl" <<'EOF'
#!/bin/sh
for url in "$@"; do :; done
echo "$url" >>"$CALLS"
case "$url" in *"${DOWN:-never-down}"*) printf 404 ;; *) printf 200 ;; esac
EOF
  chmod +x "$T/bin/gitleaks" "$T/bin/curl"
  export PATH="$T/bin:$PATH" CALLS="$T/calls"
  : >"$CALLS"

  cd "$REPO" || exit 1
  git init -q -b main .
  printf 'MIT License\n\nCopyright (c) 2026\n' >LICENSE
  printf 'steering\n' >.kiro/steering/product.md
  printf '{\n  "writeUpUrl": "https://example.org/w"\n}\n' >apps/landing/content.json
  printf '<!doctype html><p>landing</p>\n' >dist/pages/index.html
  printf '<!doctype html><p>app</p>\n' >dist/pages/app/index.html
  printf 'dist/\n' >.gitignore
  git add -A && git -c user.name=t -c user.email=t@example.org commit -qm init
}

marker() { printf 'PENDING-%s' GATE; }

@test "a clean repository passes and checks the repository, demo and app URLs" {
  run "$CHECK" --dist dist/pages
  [ "$status" -eq 0 ]
  [[ "$output" == *"release-check: ready, 0 problems"* ]]
  grep -qx "https://github.com/brennocm/doppelganger" "$CALLS"
  grep -qx "https://brennocm.github.io/doppelganger/app/" "$CALLS"
  [ "$(wc -l <"$CALLS")" -eq 3 ]
}

@test "a marker in a tracked file fails and is listed as file:line" {
  printf 'line one\nmodel: %s\n' "$(marker)" >README.md
  git add README.md
  run "$CHECK" --dist dist/pages --offline
  [ "$status" -eq 1 ]
  [[ "$output" == *"release-check: FAIL pending: README.md:2"* ]]
  [[ "$output" == *"NOT ready, 1 problem(s)"* ]]
}

@test "a marker in the built output fails" {
  marker >dist/pages/app/clips.json
  printf '{\n  "writeUpUrl": "%s"\n}\n' "$(marker)" >apps/landing/content.json
  run "$CHECK" --dist dist/pages --offline
  [ "$status" -eq 1 ]
  [[ "$output" == *"FAIL pending-built: dist/pages/app/clips.json"* ]]
  [[ "$output" == *"FAIL pending: apps/landing/content.json:2"* ]]
}

@test "markers in logs, specs and e2e fixtures are not reported" {
  mkdir -p docs .kiro/specs/x apps/landing/e2e/fixtures scripts/tests
  for f in docs/prompt-history.md docs/kiro-journal.md .kiro/specs/x/design.md \
    apps/landing/e2e/fixtures/a.svg scripts/tests/release-check.bats; do
    marker >"$f"
  done
  git add -A
  run "$CHECK" --dist dist/pages --offline
  [ "$status" -eq 0 ]
}

@test "every other check reports its own failure, and all of them run" {
  printf 'Apache License\n' >LICENSE
  git rm -rq --cached .kiro
  run env LEAKS=1 DOWN=github.io "$CHECK" --dist dist/pages
  [ "$status" -eq 1 ]
  [[ "$output" == *"FAIL license"* ]]
  [[ "$output" == *"FAIL kiro"* ]]
  [[ "$output" == *"FAIL secrets"* ]]
  [[ "$output" == *"FAIL url: https://brennocm.github.io/doppelganger/ answered 404"* ]]
  [[ "$output" == *"NOT ready, 5 problem(s)"* ]]
}

@test "a missing build output and unknown options are refused" {
  run "$CHECK" --dist nowhere --offline
  [ "$status" -eq 1 ]
  [[ "$output" == *"FAIL pending-built: no build output at nowhere"* ]]
  run "$CHECK" --bogus
  [ "$status" -eq 2 ]
}
