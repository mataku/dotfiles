#!/usr/bin/env bash

set -euo pipefail

DOTFILES_REPO="https://github.com/mataku/dotfiles.git"
DOTFILES_DIR="${HOME}/src/github.com/mataku/dotfiles"
# renovate: datasource=github-releases depName=jdx/mise
MISE_VERSION="${MISE_VERSION:-2026.10.11}"
FISH_PATH="/opt/homebrew/bin/fish"
PAM_SUDO_LOCAL="/etc/pam.d/sudo_local"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

notify_sudo() {
  osascript -e "display notification \"$1\" with title \"dotfiles\"" >/dev/null 2>&1 || true
}

if [[ "$(uname)" != "Darwin" ]]; then
  error "This script is designed for macOS only"
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  info "Installing Xcode Command Line Tools..."
  xcode-select --install
  info "Re-run this script after Xcode Command Line Tools finish installing."
  exit 1
fi

if [ ! -d "$DOTFILES_DIR" ]; then
  info "Cloning dotfiles to $DOTFILES_DIR..."
  mkdir -p "$(dirname "$DOTFILES_DIR")"
  git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
fi

cd "$DOTFILES_DIR"
info "Working in: $DOTFILES_DIR"

if [ ! -x /opt/homebrew/bin/brew ]; then
  info "Installing Homebrew..."
  notify_sudo "The Homebrew installer may ask for your password"
  sudo -v
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
eval "$(/opt/homebrew/bin/brew shellenv)"

info "Installing packages from Brewfile..."
notify_sudo "brew bundle may ask for your password"
bundle_failed=0
brew bundle --file="$DOTFILES_DIR/Brewfile" || bundle_failed=1

if [ ! -x "$HOME/.local/bin/mise" ]; then
  info "Installing mise..."
  curl -fsSL https://mise.run | MISE_VERSION="$MISE_VERSION" sh
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$HOME/Pictures/screenshots"

info "Applying dotfiles and macOS defaults..."
if [ -f "$HOME/.gitconfig" ] && [ ! -L "$HOME/.gitconfig" ]; then
  mv "$HOME/.gitconfig" "$HOME/.gitconfig.pre-mise.$(date +%Y%m%d%H%M%S)"
fi

mise trust
mise bootstrap --yes

info "Applying system settings..."
notify_sudo "System setup needs your password"
sudo -v

if [ "$(nvram StartupMute 2>/dev/null | awk '{print $2}')" != "%01" ]; then
  sudo nvram StartupMute=%01 || warn "Could not set StartupMute in NVRAM"
fi

if ! sudo grep -qE '^auth[[:space:]]+sufficient[[:space:]]+pam_tid\.so' "$PAM_SUDO_LOCAL" 2>/dev/null; then
  echo "auth       sufficient     pam_tid.so" | sudo tee -a "$PAM_SUDO_LOCAL" >/dev/null
fi

if [ -x "$FISH_PATH" ]; then
  if ! grep -qxF "$FISH_PATH" /etc/shells; then
    echo "$FISH_PATH" | sudo tee -a /etc/shells >/dev/null
  fi

  if [ "$(dscl . -read "$HOME" UserShell | awk '{print $2}')" != "$FISH_PATH" ]; then
    sudo chsh -s "$FISH_PATH" "$USER"
  fi
else
  warn "$FISH_PATH is not installed; login shell left unchanged"
fi

echo ""
info "Setup complete! 🎉 Open a new terminal to start fish."
echo ""
echo -e "${YELLOW}==================================================="
echo -e "Manual Installation Required"
echo -e "===================================================${NC}"
echo "Please install the following applications manually:"
echo ""
echo -e "${GREEN}  • Vivaldi"
echo -e "  • Android Studio"
echo -e "  • Visual Studio Code"
echo -e "  • WezTerm"
echo -e "  • Discord"
echo -e "  • Raycast"
echo -e "  • Logicool Options+"
echo -e "  • Google IME"
echo -e "  • Spotify"
echo -e "  • Karabiner-Elements"
echo -e "  • Slack"
echo -e "  • azooKey (https://azookey.com/macOS)"
echo -e "  • 1Password"
echo -e "  • Claude Code (https://docs.claude.com/claude-code)${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""
if [ "$bundle_failed" -ne 0 ]; then
  warn "brew bundle reported failures. Sign in to the App Store if mas entries failed, then re-run this script."
  exit 1
fi
