#!/usr/bin/env bash
# Build the GitHub Pages artifact. Called by `mise run build:pages`.
#
#   dist/pages/        landing page   (base: $PAGES_BASE)
#   dist/pages/app/    detector app   (base: $PAGES_BASE/app/)
#
# PAGES_BASE is "/<repo>/" on GitHub Pages and "/" (the default) for a custom
# domain or self-hosting.
set -euo pipefail

base="${PAGES_BASE:-/}"
case "$base" in
  /*/ | /) ;;
  *)
    echo "build:pages: PAGES_BASE must start and end with '/' (got '$base')" >&2
    exit 2
    ;;
esac

root="$(git rev-parse --show-toplevel)"
out="$root/dist/pages"

rm -rf "$out"

echo "build:pages: landing -> $out (base $base)"
pnpm --filter @doppelganger/landing run build --base="$base" --outDir="$out" --emptyOutDir

echo "build:pages: app -> $out/app (base ${base}app/)"
pnpm --filter @doppelganger/web run build --base="${base}app/" --outDir="$out/app" --emptyOutDir

cp "$root/apps/landing/404.html" "$out/404.html"
touch "$out/.nojekyll"

node "$root/scripts/verify-pages.mjs" "$out"
