#!/usr/bin/env bash
# Code call graph for finding code without reading whole files (graphify, https://github.com/Graphify-Labs/graphify).
# Code-only and local: tree-sitter parsing, no LLM (GRAPHIFY_BACKEND=none). The graph lives outside the repo.
#
#   bash scripts/graph.sh update                 rebuild the graph (~20 s)
#   bash scripts/graph.sh path "A" "B"           shortest call/import path from A to B
#   bash scripts/graph.sh affected "X" [...]     what depends on X
#   bash scripts/graph.sh callers "X"            direct callers of X, compact
#   bash scripts/graph.sh <any graphify command> e.g. explain "X", god-nodes
#
# Install once: uv tool install graphifyy   (the PyPI name has two y's)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export GRAPHIFY_OUT="${GRAPHIFY_OUT:-${LOCALAPPDATA:-$HOME/.cache}/emsbench/graphify}"
export GRAPHIFY_BACKEND=none GRAPHIFY_NO_TIPS=1 GRAPHIFY_QUERY_LOG_DISABLE=1
GRAPHIFY="$(command -v graphify || echo "$HOME/.local/bin/graphify")"

cmd="${1:-}"; shift || true
case "$cmd" in
  update) cd "$ROOT" && exec "$GRAPHIFY" update . --force "$@" ;;
  callers) exec "$GRAPHIFY" query "callers" --seed "$1" --context call --depth 1 --budget 600 ;;
  "") sed -n '2,10p' "$0" ;;
  *) exec "$GRAPHIFY" "$cmd" "$@" ;;
esac
