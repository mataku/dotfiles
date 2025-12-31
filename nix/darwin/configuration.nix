{ config, pkgs, inputs, username, ... }:

{
  # Set the primary user for system defaults
  system.primaryUser = username;

  # to use nix-darwin with Determinate
  nix.enable = false;

  # macOS version compatibility
  system.stateVersion = 5;

  environment.etc.zshenv.enable = false;

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
  };

  # Enable sudo authentication with Touch ID
  security.pam.services.sudo_local.touchIdAuth = true;

  programs.fish.enable = true;

  users.users.${username} = {
    name = username;
    home = "/Users/${username}";
    shell = pkgs.fish;
  };
}
