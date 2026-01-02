#!/usr/bin/env bash

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

CURRENT_USER="$USER"
sudo sh -c "export USER='$CURRENT_USER' NIX_CONFIG='${NIX_CONFIG:-}'; nix run nix-darwin --extra-experimental-features 'nix-command flakes' --impure --show-trace -- switch --flake '.#mataku-macbook' --impure"

if [ $? -eq 0 ]; then
    info "✅ nix-darwin configuration activated successfully!"
else
    error "Failed to activate nix-darwin configuration"
    exit 1
fi
