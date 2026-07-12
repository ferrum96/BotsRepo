#!/usr/bin/env bash
# Install repo git hooks from .githooks/ into .git/hooks/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$ROOT/.githooks"
HOOKS_DST="$ROOT/.git/hooks"

if [[ ! -d "$HOOKS_DST" ]]; then
  echo "Not a git repo: $ROOT" >&2
  exit 1
fi

mkdir -p "$HOOKS_SRC"
for hook in "$HOOKS_SRC"/*; do
  [[ -f "$hook" ]] || continue
  name="$(basename "$hook")"
  chmod +x "$hook"
  ln -sfn "../../.githooks/$name" "$HOOKS_DST/$name"
  echo "installed $name -> .githooks/$name"
done

echo "Git hooks installed."
