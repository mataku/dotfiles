{ config, pkgs, inputs, username, ... }:

{
  # Set the primary user for system defaults
  system.primaryUser = username;

  # macOS version compatibility
  system.stateVersion = 5;

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
        show-process-indicators = false; # Don't show indicator lights for open applications
      };

      # Finder settings
      finder = {
        AppleShowAllExtensions = true;
        AppleShowAllFiles = false;
        FXEnableExtensionChangeWarning = false;
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

        # Sound settings
        "com.apple.sound.beep.volume" = 0.000;
        "com.apple.sound.beep.feedback" = 0;
        AppleInterfaceStyle = "Dark";
        AppleInterfaceStyleSwitchesAutomatically = false;
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

  # Disable startup chime
  system.nvram.variables = {
    "StartupMute" = "%01"; # Mute startup sound
  };

  # Enable sudo authentication with Touch ID
  security.pam.services.sudo_local.touchIdAuth = true;

  users.users.${username} = {
    name = username;
    home = "/Users/${username}";
  };

  # Post-activation message for manual installations
  system.activationScripts.postActivation.text = ''
    ZSH_PATH="/Users/${username}/.nix-profile/bin/zsh"
    if ! grep -qF "$ZSH_PATH" /etc/shells; then
      echo "$ZSH_PATH" >> /etc/shells
    fi

    echo ""
    echo -e "\033[1;33m==================================================="
    echo -e "Manual Installation Required"
    echo -e "===================================================\033[0m"
    echo "Please install the following applications manually:"
    echo ""
    echo -e "\033[1;32m  • Vivaldi"
    echo -e "  • Xcode"
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
    echo -e "  • azooKey (https://azookey.com/macOS)\033[0m"
    echo ""
    echo -e "\033[1;33m===================================================\033[0m"
    echo ""
    echo -e "\033[1;36m==================================================="
    echo -e "Claude Code Installation"
    echo -e "===================================================\033[0m"
    echo "Check the latest installation instructions at:"
    echo -e "\033[1;32m  https://docs.claude.com/claude-code\033[0m"
    echo -e "\033[1;36m===================================================\033[0m"
    echo ""
    echo -e "\033[1;36m==================================================="
    echo -e "Cica Font Installation"
    echo -e "===================================================\033[0m"
    echo "Download and install the Cica font (used by WezTerm):"
    echo -e "\033[1;32m  https://github.com/miiton/Cica\033[0m"
    echo -e "\033[1;36m===================================================\033[0m"
    echo ""
  '';
}
