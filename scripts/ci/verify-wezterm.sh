#!/bin/bash

set -euo pipefail

WEZTERM="/Applications/WezTerm.app/Contents/MacOS/wezterm"
FONT_DIR="$HOME/Library/Fonts"

if ! ls "$FONT_DIR"/Cica-*.ttf; then
  echo "::error::font-cica installed no font files in $FONT_DIR"
  exit 1
fi

# Why font_dirs is set: wezterm finds fonts through CoreText on macOS, which has not always registered a font the cask has just copied.
# Why the output is searched: wezterm falls back to a built-in font and still exits 0 when a configured font is missing.
status=0
output=$("$WEZTERM" --config-file "$HOME/.config/wezterm/wezterm.lua" --config "font_dirs={'$FONT_DIR'}" ls-fonts 2>&1) || status=$?
echo "$output"

if [ "$status" -ne 0 ]; then
  echo "::error::wezterm exited with status $status"
  exit "$status"
fi

if echo "$output" | grep -q "Unable to load a font"; then
  echo "::error::wezterm failed to load a configured font"
  exit 1
fi
