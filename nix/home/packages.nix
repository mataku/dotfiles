{ config, pkgs, pkgs-unstable, ... }:

let
  unstableNames = [
    "neovim"
    "fish"
    "git"
    "gh"
    "ripgrep"
    "lazygit"
    "fzf"
    "bat"
    "fd"
    "lsd"
    "tmux"
    "jq"
    "octorus"
  ];

  unstablePackages = map (name: pkgs-unstable.${name}) unstableNames;
in
{
  # All packages migrated from Brewfile
  home.packages = (with pkgs; [
    # === CLI Tools ===
    tree             # Directory tree view

    # === Text Processing ===
    yq-go            # YAML processor (yq)
    nkf              # Network Kanji Filter
    less             # Pager

    # === Git Tools ===
    ghq              # Git repository manager
    hub              # Git wrapper for GitHub
    tig              # Text-mode interface for git

    # === Terminal & Shell ===
    zsh              # Z shell
    reattach-to-user-namespace  # tmux macOS clipboard support

    # === GNU Tools (for macOS compatibility) ===
    coreutils        # GNU core utilities
    curl             # Transfer data with URLs
    gnused           # GNU sed
    gnugrep          # GNU grep

    # === Development Tools ===
    direnv           # Environment switcher for shell
    cmake            # Build system
    pkg-config       # Package config helper

    # === Language Runtimes ===
    nodenv           # Node.js version manager
    rustup           # Rust toolchain manager
    lua              # Lua programming language

    # === Version Managers ===
    rbenv            # Ruby version manager
    fvm              # Flutter Version Manager

    # === Build Tools ===
    cocoapods        # Dependency manager for Swift/Objective-C

    # === Image & Video Processing ===
    ffmpeg           # Video/audio processing
    imagemagick      # Image manipulation
    gifsicle         # GIF optimizer
    pngquant         # PNG compression
    potrace          # Bitmap to vector tracing

    # === Cloud & DevOps ===
    kubectl          # Kubernetes CLI

    # === Testing & Coverage ===
    lcov             # Code coverage tool

    # === Security & Crypto ===
    gnupg            # GNU Privacy Guard
    pinentry_mac     # GPG PIN entry for macOS

    # === Code Tools ===
    universal-ctags  # Source code indexing
    sourceHighlight  # Source code syntax highlighter
    nixfmt           # Nix code formatter

    # === Libraries ===
    libsodium        # Cryptography library
    fontconfig       # Font configuration
    glib             # Low-level core library

    # === Additional Tools ===
    pinact           # Pin clipboard manager (check availability)
  ]) ++ unstablePackages;

  # Note: The following are NOT included as they are replaced by Nix's declarative approach:
  # - font-cica (will be custom derivation)
  # - swiftformat-for-xcode (Xcode extension - manual installation)

  # Mac App Store apps (installed manually with `mas`):
  # - Xcode (497799835)
  # - Amphetamine (937984704)
  # - Keynote (409183694)
  # - Numbers (409203825)
  # - Pages (409201541)
  # - The Unarchiver (425424353)
}
