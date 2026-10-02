#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
parts_dir="$ROOT/scripts/game-parts"
tmp=$(mktemp)
cat "$parts_dir"/part-* | tr -d '\n' | base64 -d > "$tmp"
tar -xzf "$tmp" -C "$ROOT"
rm -f "$tmp"
echo "game sources restored"
