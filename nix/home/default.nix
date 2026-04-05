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
    ./programs/zsh.nix
  ];

  home.sessionVariables = {
    # XDG Base Directory (explicitly set for compatibility)
    XDG_CONFIG_HOME = "${config.xdg.configHome}";
    XDG_DATA_HOME = "${config.xdg.dataHome}";
    XDG_CACHE_HOME = "${config.xdg.cacheHome}";
    XDG_STATE_HOME = "${config.xdg.stateHome}";
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

    # Zsh configuration files
    "zsh/.zshrc".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/.zshrc";
    "zsh/alias.zsh".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/alias.zsh";
    "zsh/env.zsh".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/env.zsh";
    "zsh/prompt.zsh".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/prompt.zsh";
    "zsh/functions.zsh".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/functions.zsh";
    "zsh/environments/android.zsh".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/environments/android.zsh";

    "zsh-abbr/user-abbreviations".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/zsh/zsh-abbr/user-abbreviations";
  };

  # Legacy dotfiles (for tools that don't support XDG yet)
  home.file = {
    # Git configuration
    ".gitconfig" = {
      source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.gitconfig";
      force = true;  # .gitconfig may already exist from git's first use
    };

    # IRB (Ruby REPL) - no XDG support yet
    ".irbrc".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.irbrc";

    # Gem configuration - no XDG support yet
    ".gemrc".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/src/github.com/mataku/dotfiles/.gemrc";

    # Zsh bootstrap (sets ZDOTDIR for XDG compliance)
    ".zshenv".text = ''export ZDOTDIR="$HOME/.config/zsh"'';
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
    package = pkgs.temurin-bin-21;
  };
}
