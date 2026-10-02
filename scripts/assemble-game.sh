#!/usr/bin/env bash
# Legacy helper: sources now live in src/ (committed).
# game-parts tarball is corrupt/outdated — do not require it for build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/src/game/CityScene.ts" && -f "$ROOT/src/main.ts" ]]; then
  echo "game sources already present in src/ — skipping assemble"
  exit 0
fi
parts_dir="$ROOT/scripts/game-parts"
if [[ ! -d "$parts_dir" ]]; then
  echo "error: missing src/game and no game-parts to restore" >&2
  exit 1
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cat "$parts_dir"/part-* | tr -d '\n' | base64 -d > "$tmp"
if ! tar -tzf "$tmp" >/dev/null 2>&1; then
  echo "error: game-parts tarball is corrupt; commit real files under src/" >&2
  exit 1
fi
tar -xzf "$tmp" -C "$ROOT"
echo "game sources restored from game-parts"
