{ config, pkgs, lib, ... }:

{
  # Home Manager version compatibility
  home.stateVersion = "24.11";

  # User information
  home.username = lib.mkDefault (builtins.getEnv "USER");
  home.homeDirectory = lib.mkDefault (
    if pkgs.stdenv.isDarwin
    then "/Users/${config.home.username}"
    else "/home/${config.home.username}"
  );

  # XDG Base Directory specification
  xdg = {
    enable = true;

    # XDG directories (following the specification)
    configHome = "${config.home.homeDirectory}/.config";
    dataHome = "${config.home.homeDirectory}/.local/share";
    cacheHome = "${config.home.homeDirectory}/.cache";
    stateHome = "${config.home.homeDirectory}/.local/state";
  };

  # Import packages and program configurations
  imports = [
    ./packages.nix
    ./programs/fish.nix
    ./programs/git.nix
  ];

  # Environment variables (replacing fish/env.fish)
  home.sessionVariables = {
    # XDG Base Directory (explicitly set for compatibility)
    XDG_CONFIG_HOME = "${config.xdg.configHome}";
    XDG_DATA_HOME = "${config.xdg.dataHome}";
    XDG_CACHE_HOME = "${config.xdg.cacheHome}";
    XDG_STATE_HOME = "${config.xdg.stateHome}";

    # Editor
    EDITOR = "nvim";

    # Go
    GOPATH = "${config.home.homeDirectory}/go";

    # Locale
    LANG = "ja_JP.UTF-8";

    # Ripgrep config (XDG-compliant path)
    RIPGREP_CONFIG_PATH = "${config.xdg.configHome}/ripgrep/config";
  };

  # XDG-compliant dotfile symlinking (using mkOutOfStoreSymlink for live editing)
  xdg.configFile = {
    # Neovim configuration (only init.lua and lua directory)
    "nvim/init.lua".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/nvim/init.lua";
    "nvim/lua".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/nvim/lua";

    # WezTerm configuration
    "wezterm/wezterm.lua".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/wezterm/wezterm.lua";

    # Lazygit configuration (XDG-compliant)
    "lazygit/config.yml".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/lazygit/config.yml";

    # Tig configuration (XDG-compliant)
    "tig/config".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.tigrc";

    # Ripgrep configuration (XDG-compliant)
    "ripgrep/config".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.ripgreprc";

    # Git commit template (XDG-compliant)
    "git/commit_template".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.commit_template";

    # Fish configuration files (all managed via symlinks)
    "fish/config.fish".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/config.fish";
    "fish/env.fish".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/env.fish";
    "fish/alias.fish".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/alias.fish";
    "fish/fish_plugins".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/fish_plugins";
    "fish/fishfile".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/fishfile";

    # Fish environment configurations
    "fish/environments/android.fish".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/environments/android.fish";

    # Fish functions directory
    "fish/functions".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/fish/functions";
  };

  # Legacy dotfiles (for tools that don't support XDG yet)
  home.file = {
    # IRB (Ruby REPL) - no XDG support yet
    ".irbrc".source = ../../.irbrc;

    # Gem configuration - no XDG support yet
    ".gemrc".source = ../../.gemrc;
  };

  # Let Home Manager install and manage itself
  programs.home-manager.enable = true;

  # Direnv integration (replacing manual direnv hook)
  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  programs.java = {
    enable = true;
    package = pkgs.temurin-bin-17;
  };
}
