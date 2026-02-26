{ config, pkgs, ... }:

{
  # All packages migrated from Brewfile
  home.packages = with pkgs; [
    # === CLI Tools ===
    bat              # Better cat with syntax highlighting
    fd               # Better find
    fzf              # Fuzzy finder
    ripgrep          # Better grep
    lsd              # Better ls
    tree             # Directory tree view

    # === Text Processing ===
    jq               # JSON processor
    yq-go            # YAML processor (yq)
    nkf              # Network Kanji Filter
    less             # Pager

    # === Git Tools ===
    git              # Version control
    gh               # GitHub CLI
    ghq              # Git repository manager
    hub              # Git wrapper for GitHub
    tig              # Text-mode interface for git
    lazygit          # Terminal UI for git

    # === Terminal & Shell ===
    tmux             # Terminal multiplexer
    zsh              # Z shell
    reattach-to-user-namespace  # tmux macOS clipboard support

    # === Editor ===
    neovim           # Modern Vim

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
    go               # Go programming language
    kotlin           # Kotlin JVM language
    nodejs_20        # Node.js 20.x (default version)
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
    nixfmt-rfc-style # Nix code formatter

    # === Libraries ===
    libsodium        # Cryptography library
    fontconfig       # Font configuration
    glib             # Low-level core library

    # === Mac App Store CLI ===
    mas              # Mac App Store command line

    # === Additional Tools ===
    pinact           # Pin clipboard manager (check availability)
    octorus
  ];

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
