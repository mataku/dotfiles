#!/usr/bin/env bash

set -euo pipefail

DOTFILES_DIR="${HOME}/src/github.com/mataku/dotfiles"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[1;36m'
NC='\033[0m'

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
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

if [ ! -d "$DOTFILES_DIR" ]; then
  error "dotfiles not found at $DOTFILES_DIR. Run setup.sh first."
  exit 1
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
brew bundle --file="$DOTFILES_DIR/Brewfile"

if [ ! -x "$HOME/.local/bin/mise" ]; then
  info "Installing mise..."
  curl -fsSL https://mise.run | sh
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$HOME/Pictures/screenshots"

info "Applying dotfiles and macOS defaults..."
mise trust
mise bootstrap --yes

echo ""
info "Installation complete! 🎉"
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
echo ""
echo -e "${CYAN}Claude Code uses the native installer; the Homebrew formula lags behind releases.${NC}"
echo -e "${YELLOW}===================================================${NC}"
echo ""
