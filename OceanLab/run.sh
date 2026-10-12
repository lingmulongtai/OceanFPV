#!/usr/bin/env sh
set -eu
OCEAN_PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v godot >/dev/null 2>&1; then
  OCEAN_ENGINE=godot
elif command -v godot4 >/dev/null 2>&1; then
  OCEAN_ENGINE=godot4
else
  echo 'Godot 4.4+ をインストールして project.godot を開いてください。' >&2
  exit 1
fi
if [ ! -f "$OCEAN_PROJECT_DIR/.godot/global_script_class_cache.cfg" ]; then
  "$OCEAN_ENGINE" --headless --path "$OCEAN_PROJECT_DIR" --editor --import
fi
exec "$OCEAN_ENGINE" --path "$OCEAN_PROJECT_DIR" "$@"
