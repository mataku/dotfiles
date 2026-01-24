#!/bin/bash

set -euo pipefail

REPO="mataku/dotfiles"
MINUTES_AGO=${1:-20}

CUTOFF_TIME=$(date -u -v-${MINUTES_AGO}M +"%Y-%m-%dT%H:%M:%SZ")

echo "Deleting caches for $REPO created before: $CUTOFF_TIME"

gh cache list --repo "$REPO" --limit 1000 --json id,createdAt | \
  jq -r --arg cutoff "$CUTOFF_TIME" \
    '.[] | select(.createdAt < $cutoff) | .id' | \
  while read -r cache_id; do
    echo "Deleting cache: $cache_id"
    gh cache delete "$cache_id" --repo "$REPO" || true
  done

echo "Cleanup completed"
