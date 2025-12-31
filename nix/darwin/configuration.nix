{ config, pkgs, inputs, username, ... }:

{
  # Set the primary user for system defaults
  system.primaryUser = username;
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

  # macOS system preferences
  system = {
    defaults = {
      # Dock settings
      dock = {
        autohide = false;
        orientation = "left";
        show-recents = false;
        tilesize = 38;
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
        InitialKeyRepeat = 15; # Fast initial key repeat
        KeyRepeat = 2; # Fast key repeat

        # Automatic text substitutions (matches current system state)
        NSAutomaticCapitalizationEnabled = true;
        NSAutomaticDashSubstitutionEnabled = false;
        NSAutomaticPeriodSubstitutionEnabled = false;
        NSAutomaticQuoteSubstitutionEnabled = false;
      };

      # Trackpad settings
      trackpad = {
        Clicking = true; # Tap to click
        TrackpadRightClick = true;
        TrackpadThreeFingerDrag = false;
      };

      # Screenshots settings
      screencapture = {
        location = "~/Pictures/screenshots";
        type = "png";
      };
    };

    # macOS version compatibility
    stateVersion = 4;
  };

  # Enable sudo authentication with Touch ID
  security.pam.services.sudo_local.touchIdAuth = true;

  # User configuration
  users.users.${primaryUser} = {
    name = primaryUser;
    home = "/Users/${primaryUser}";
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
