#!/usr/bin/env bash
#
# Bootstrap entrypoint — suitable for `curl -fsSL .../setup.sh | sh`.
# Ensures prerequisites, clones the repository, then hands off to
# scripts/install.sh for the Nix-based setup.

set -euo pipefail

DOTFILES_REPO="https://github.com/mataku/dotfiles.git"
DOTFILES_DIR="${HOME}/src/github.com/mataku/dotfiles"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is designed for macOS only" >&2
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "Re-run this script after Xcode Command Line Tools finish installing."
  exit 1
fi

if [ ! -d "$DOTFILES_DIR" ]; then
  echo "Cloning dotfiles to $DOTFILES_DIR..."
  mkdir -p "$(dirname "$DOTFILES_DIR")"
  git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
fi

cd "$DOTFILES_DIR"
exec ./scripts/install.sh
