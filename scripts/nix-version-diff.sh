#!/bin/bash

set -euo pipefail

BEFORE="${1:?usage: nix-version-diff.sh <before.json> <after.json> <output.md>}"
AFTER="${2:?usage: nix-version-diff.sh <before.json> <after.json> <output.md>}"
OUTPUT="${3:?usage: nix-version-diff.sh <before.json> <after.json> <output.md>}"

DIFF_JSON="$(mktemp)"

jq -s '
  (.[0] | map({key: .name, value: .version}) | from_entries) as $before
  | (.[1] | map({key: .name, value: .version}) | from_entries) as $after
  | {
      updated: [
        ($before | keys_unsorted[]) as $k
        | select($after[$k] != null and $before[$k] != $after[$k])
        | {name: $k, before: $before[$k], after: $after[$k]}
      ],
      added: [
        ($after | keys_unsorted[]) as $k
        | select($before[$k] == null)
        | {name: $k, version: $after[$k]}
      ],
      removed: [
        ($before | keys_unsorted[]) as $k
        | select($after[$k] == null)
        | {name: $k, version: $before[$k]}
      ]
    }
' "$BEFORE" "$AFTER" > "$DIFF_JSON"

{
  echo "## Package version changes"
  echo ""

  UPDATED_COUNT=$(jq '.updated | length' "$DIFF_JSON")
  ADDED_COUNT=$(jq '.added | length' "$DIFF_JSON")
  REMOVED_COUNT=$(jq '.removed | length' "$DIFF_JSON")

  if [ "$UPDATED_COUNT" = "0" ] && [ "$ADDED_COUNT" = "0" ] && [ "$REMOVED_COUNT" = "0" ]; then
    echo "_No user-facing package version changes._"
  else
    if [ "$UPDATED_COUNT" != "0" ]; then
      echo "### Updated ($UPDATED_COUNT)"
      echo ""
      echo "| Package | Before | After |"
      echo "|---------|--------|-------|"
      jq -r '.updated[] | "| `\(.name)` | \(.before) | \(.after) |"' "$DIFF_JSON"
      echo ""
    fi
    if [ "$ADDED_COUNT" != "0" ]; then
      echo "### Added ($ADDED_COUNT)"
      echo ""
      jq -r '.added[] | "- `\(.name)` \(.version)"' "$DIFF_JSON"
      echo ""
    fi
    if [ "$REMOVED_COUNT" != "0" ]; then
      echo "### Removed ($REMOVED_COUNT)"
      echo ""
      jq -r '.removed[] | "- `\(.name)` \(.version)"' "$DIFF_JSON"
      echo ""
    fi
  fi
} > "$OUTPUT"

rm -f "$DIFF_JSON"

echo "--- Generated diff ---"
cat "$OUTPUT"
