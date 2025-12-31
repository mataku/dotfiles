#!/usr/bin/env bash
#
# Nix-based dotfiles installation script
# This script installs Nix, nix-darwin, and activates the configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print functions
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    error "This script is designed for macOS only"
    exit 1
fi

info "🚀 Starting Nix-based dotfiles installation"

# Step 1: Install Nix using Determinate Systems installer
if ! command -v nix &> /dev/null; then
    info "📦 Installing Nix..."
    curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | \
        sh -s -- install --no-confirm

    info "✅ Nix installed successfully"
else
    info "✅ Nix already installed"
fi

# Step 2: Source Nix environment
if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
    info "Loading Nix environment..."
    . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
fi

# Verify Nix is available
if ! command -v nix &> /dev/null; then
    error "Nix installation failed or not in PATH"
    error "Please restart your terminal and run this script again"
    exit 1
fi

# Step 3: Navigate to dotfiles directory
DOTFILES_DIR="${HOME}/src/github.com/mataku/dotfiles"

if [ ! -d "$DOTFILES_DIR" ]; then
    info "📥 Cloning dotfiles repository..."
    mkdir -p "$(dirname "$DOTFILES_DIR")"
    git clone https://github.com/mataku/dotfiles.git "$DOTFILES_DIR"
fi

cd "$DOTFILES_DIR"
info "Working in: $DOTFILES_DIR"

# Step 4: Build and activate nix-darwin configuration
info "🔨 Building nix-darwin configuration..."
info "This may take a while on first run as packages are downloaded..."

# Check architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    SYSTEM="aarch64-darwin"
elif [[ "$ARCH" == "x86_64" ]]; then
    SYSTEM="x86_64-darwin"
else
    error "Unsupported architecture: $ARCH"
    exit 1
fi

info "Detected architecture: $SYSTEM"

# Run nix-darwin switch
sudo nix run nix-darwin --extra-experimental-features "nix-command flakes" --show-trace -- \
    switch --flake ".#mataku-macbook"

if [ $? -eq 0 ]; then
    info "✅ nix-darwin configuration activated successfully!"
else
    error "Failed to activate nix-darwin configuration"
    exit 1
fi

# Step 5: Post-installation instructions
echo ""
info "Installation complete! 🎉"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Next steps:"
echo ""
echo "  1. Restart your terminal or run:"
echo "     exec fish"
echo ""
echo "  2. Verify packages are working:"
echo "     bat --version"
echo "     fzf --version"
echo "     git --version"
echo ""
echo "  3. Optional: Install Mac App Store apps manually"
echo "     mas install 497799835  # Xcode"
echo "     mas install 937984704  # Amphetamine"
echo "     # ... see README for full list"
echo ""
echo "  4. Optional: Install Flutter manually (if needed)"
echo "     See: https://docs.flutter.dev/get-started/install/macos"
echo ""
echo "  5. Optional: Set up Rust toolchain"
echo "     rustup default stable"
echo "     rustup component add rust-analyzer"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
warn "If you encounter any issues, check:"
echo "  - Rollback: darwin-rebuild --rollback"
echo "  - Rebuild: darwin-rebuild switch --flake ~/.config/nix-darwin"
echo ""
