#!/usr/bin/env bash
# Build the static demo of Site Lab and publish it to the gh-pages branch, which GitHub Pages serves at
# https://fedezhou.github.io/Energy-Management-VPP/ (one-time setting: Settings -> Pages -> Deploy from a branch ->
# gh-pages, / (root)).
#
# Steps: 1) python scripts/export_static_demo.py   (pre-computes the example runs into web/app/public/demo/)
#        2) bash scripts/deploy_pages.sh           (this script: static build + push)
#
# The gh-pages branch holds only the built site, as a single commit that is replaced on every deploy, so the
# generated JSON (about 18 MB) never enters main's history.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite "/Energy-Management-VPP/" into a Windows path

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_NAME="Energy-Management-VPP"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
OUT="$(mktemp -d)"

if [ ! -f "$ROOT/web/app/public/demo/runs.json" ]; then
  echo "No demo data: run 'python scripts/export_static_demo.py' first." >&2
  exit 1
fi

echo "Building the static demo into $OUT"
(cd "$ROOT/web/app" && VITE_STATIC_DEMO=1 VITE_BASE="/$REPO_NAME/" npx vite build --outDir "$OUT" --emptyOutDir)
touch "$OUT/.nojekyll"              # serve files as they are (no Jekyll processing)
cp "$OUT/index.html" "$OUT/404.html" # unknown paths fall back to the app

SOURCE="$(git -C "$ROOT" rev-parse --short HEAD)"
cd "$OUT"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Static demo of Site Lab, built from $SOURCE"
git push -q -f "$REMOTE" gh-pages
echo "Published. GitHub Pages: https://fedezhou.github.io/$REPO_NAME/"
