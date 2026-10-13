#!/usr/bin/env bash

set -euo pipefail

DOTFILES_REPO="https://github.com/mataku/dotfiles.git"
DOTFILES_DIR="${HOME}/src/github.com/mataku/dotfiles"
FISH_PATH="/opt/homebrew/bin/fish"
PAM_SUDO_LOCAL="/etc/pam.d/sudo_local"

notify_sudo() {
  osascript -e "display notification \"$1\" with title \"dotfiles\"" >/dev/null 2>&1 || true
}

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

"$DOTFILES_DIR/scripts/install.sh"

notify_sudo "One-time system setup needs your password"
sudo -v

if [ "$(nvram StartupMute 2>/dev/null | awk '{print $2}')" != "%01" ]; then
  sudo nvram StartupMute=%01
fi

if ! sudo grep -qE '^auth[[:space:]]+sufficient[[:space:]]+pam_tid\.so' "$PAM_SUDO_LOCAL" 2>/dev/null; then
  echo "auth       sufficient     pam_tid.so" | sudo tee -a "$PAM_SUDO_LOCAL" >/dev/null
fi

if ! grep -qxF "$FISH_PATH" /etc/shells; then
  echo "$FISH_PATH" | sudo tee -a /etc/shells >/dev/null
fi

if [ "$(dscl . -read "$HOME" UserShell | awk '{print $2}')" != "$FISH_PATH" ]; then
  chsh -s "$FISH_PATH"
fi

echo "Setup complete. Open a new terminal to start fish."
