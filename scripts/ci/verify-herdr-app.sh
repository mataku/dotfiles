#!/bin/bash

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP_HOME="$HOME/.config/herdr-app"
HERDR_APP="$HOME/.local/bin/herdr-app"
NODE="$HOME/.nodenv/shims/node"

fail() {
  echo "::error::$1"
  exit 1
}

cd "$REPO/herdr-app"

while IFS= read -r file; do
  python3 -m json.tool "$APP_HOME/$file" >/dev/null || fail "herdr-app/$file is not valid JSON"
done < <(git ls-files '*.json' ':!mods/simulators/viewer')

for manifest in mods/*/mod.json; do
  "$HERDR_APP" check "$APP_HOME/$(dirname "$manifest")"
done

test -f mods/simulators/viewer/node_modules/serve-sim/package.json || fail "the bootstrap task did not install serve-sim"

"$NODE" --test mods/*/*.test.js
