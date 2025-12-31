{ config, pkgs, inputs, ... }:

{
  # Enable the Nix daemon for multi-user installations
  services.nix-daemon.enable = true;

  # Nix package manager settings
  nix = {
    package = pkgs.nix;

    settings = {
      # Enable flakes and nix-command (modern Nix features)
      experimental-features = [ "nix-command" "flakes" ];

      # Trust admin users for Nix operations
      trusted-users = [ "@admin" ];

      # Binary cache settings for faster builds
      substituters = [
        "https://cache.nixos.org"
      ];
      trusted-public-keys = [
        "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      ];
    };

    # Garbage collection to save disk space
    gc = {
      automatic = true;
      interval = { Weekday = 0; Hour = 2; Minute = 0; }; # Weekly on Sunday at 2 AM
      options = "--delete-older-than 30d";
    };
  };

  # System-wide packages (available to all users)
  environment.systemPackages = with pkgs; [
    vim
    git
  ];

  # Install fonts
  fonts.packages = with pkgs; [
    # Font Cica will be added via custom derivation
    # For now, using nerd-fonts as alternative
    (nerdfonts.override { fonts = [ "FiraCode" "JetBrainsMono" ]; })
  ];

  # macOS system preferences
  system = {
    defaults = {
      # Dock settings
      dock = {
        autohide = true;
        orientation = "bottom";
        show-recents = false;
        tilesize = 48;
      };

      # Finder settings
      finder = {
        AppleShowAllExtensions = true;
        AppleShowAllFiles = false;
        FXEnableExtensionChangeWarning = false;
        FXPreferredViewStyle = "Nlsv"; # List view
        ShowPathbar = true;
        ShowStatusBar = true;
      };

      # Global macOS settings
      NSGlobalDomain = {
        # Keyboard settings
        AppleKeyboardUIMode = 3; # Enable full keyboard access
        ApplePressAndHoldEnabled = false; # Disable press-and-hold for keys
        InitialKeyRepeat = 15; # Fast initial key repeat
        KeyRepeat = 2; # Fast key repeat

        # Disable automatic text substitutions
        NSAutomaticCapitalizationEnabled = false;
        NSAutomaticDashSubstitutionEnabled = false;
        NSAutomaticPeriodSubstitutionEnabled = false;
        NSAutomaticQuoteSubstitutionEnabled = false;
        NSAutomaticSpellingCorrectionEnabled = false;

        # Save to disk (not iCloud) by default
        NSDocumentSaveNewDocumentsToCloud = false;
      };

      # Trackpad settings
      trackpad = {
        Clicking = true; # Tap to click
        TrackpadRightClick = true;
        TrackpadThreeFingerDrag = false;
      };

      # Screenshots settings
      screencapture = {
        location = "~/Desktop";
        type = "png";
      };
    };

    # Keyboard settings
    keyboard = {
      enableKeyMapping = true;
      remapCapsLockToControl = true;
    };

    # macOS version compatibility
    stateVersion = 4;
  };

  # Enable sudo authentication with Touch ID
  security.pam.enableSudoTouchIdAuth = true;

  # User configuration
  users.users.mataku = {
    name = "mataku";
    home = "/Users/mataku";
  };

  # Shells available for users
  environment.shells = with pkgs; [
    bash
    fish
  ];

  # Set default shell (fish will be set per-user in home-manager)
  # But make it available system-wide
  programs.fish.enable = true;
}
