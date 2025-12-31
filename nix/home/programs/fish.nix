{ config, pkgs, lib, ... }:

{
  programs.fish = {
    enable = true;

    # Shell aliases (from alias.fish)
    shellAliases = {
      g = "git";
      t = "tig";
      v = "nvim";
      ls = "lsd -a";
      bx = "bundle exec";
      dx = "docker exec";
      sudo = "sudo ";
      bi = "bundle install -j4";
      gpush = "git push -u origin (git rev-parse --abbrev-ref HEAD)";
      gp = "git pull";
      gpull = "git pull";
      gst = "git st";
      gdif = "git diff";
      gcm = "git cm";
      gwip = "git wip";
      gl = "git log";
      K = "kubectl";
    } // lib.optionalAttrs pkgs.stdenv.isDarwin {
      # macOS-specific aliases
      grep = "ggrep";
      sed = "gsed";
    };

    # Shell abbreviations
    shellAbbrs = {
      ga = "g add";
    };

    # Interactive shell initialization
    interactiveShellInit = ''
      # Fish greeting and colors (from env.fish)
      set fish_greeting ""
      set fish_color_command normal
      set fish_color_error FF7043

      # FZF configuration (from env.fish)
      set -x FZF_DEFAULT_OPTS '--cycle --ansi --select-1 --exit-0'
      set -x FZF_DEFAULT_COMMAND 'fd --type f --hidden --follow --exclude .git'

      # Current git branch detection (from config.fish)
      if test -e ./.git
        set current_branch (command git rev-parse --abbrev-ref HEAD)
      end

      # Source optional configuration files
      if test -e ~/.config/fish/github_access_token.fish
        . ~/.config/fish/github_access_token.fish
      end

      if test -e ~/.config/fish/work.fish
        . ~/.config/fish/work.fish
      end

      if test -e ~/.config/fish/android_env.fish
        . ~/.config/fish/android_env.fish
      end

      # FZF history selection function (from config.fish)
      function fzf_select_history
        history | fzf | read selection
        if [ $selection ]
          commandline $selection
        else
          commandline ''''
        end
      end

      # Key bindings for FZF history (Ctrl+R)
      function fish_user_key_bindings
        bind ''\cr fzf_select_history
      end
    '';

    # Login shell initialization
    loginShellInit = ''
      # Direnv hook (replaces: direnv hook fish | .)
      # This is handled by programs.direnv in default.nix
    '';

    # Fish plugins (from fish_plugins)
    plugins = [
      # oh-my-fish/plugin-argu
      {
        name = "plugin-argu";
        src = pkgs.fetchFromGitHub {
          owner = "oh-my-fish";
          repo = "plugin-argu";
          rev = "1332d5c0561f9587c956b16cf096034f67202c83";
          sha256 = "sha256-dDT0rRhkSQV/ZqhtaPnDwhaxUyjg+6VGGeH9L2SUsEY=";
        };
      }

      # oh-my-fish/plugin-extract
      {
        name = "plugin-extract";
        src = pkgs.fetchFromGitHub {
          owner = "oh-my-fish";
          repo = "plugin-extract";
          rev = "5d05f9f15d3be8437880078171d1e32025b9ad9f";
          sha256 = "sha256-hFM8uDHDfKBVn4CgRdfRaD0SzmVzOPjfMxU9X6yATzE=";
        };
      }

      # oh-my-fish/plugin-expand
      {
        name = "plugin-expand";
        src = pkgs.fetchFromGitHub {
          owner = "oh-my-fish";
          repo = "plugin-expand";
          rev = "ffb18d57506c7332ae8b7b8bc8d7f56e3a2390d2";
          sha256 = "sha256-mEgoKxoe7/88p0/5vcX27VM83wp4Cii5C3sTjwnoLJ8=";
        };
      }

      # fisherman/getopts
      {
        name = "getopts";
        src = pkgs.fetchFromGitHub {
          owner = "jorgebucaran";
          repo = "getopts.fish";
          rev = "e6f87012692088a0a9fea426f08e83001668ce66";
          sha256 = "sha256-vlIXBWCQrz2ZlxPhi2/+gweKnT6pcMQQ2NYlysqn7ig=";
        };
      }

      # fisherman/spin
      {
        name = "spin";
        src = pkgs.fetchFromGitHub {
          owner = "jorgebucaran";
          repo = "fish-spin";
          rev = "d2ecacd3fe7126e822ce8918389f3ad93b14c86c";
          sha256 = "sha256-TzQ97h9tBRUg+A7DSKeTBWLQuThicbu19DHMwkmUXdg=";
        };
      }

      # 0rax/fish-bd
      {
        name = "fish-bd";
        src = pkgs.fetchFromGitHub {
          owner = "0rax";
          repo = "fish-bd";
          rev = "ab686e028bfe95fa561a4f4e57840e36902d4d7d";
          sha256 = "sha256-GeWjoakXa0t2TsMC/wpLEmsSVGhHFhBVK3v9eyQdzv0=";
        };
      }

      # jethrokuan/z
      {
        name = "z";
        src = pkgs.fetchFromGitHub {
          owner = "jethrokuan";
          repo = "z";
          rev = "d2f502f5575b18a32e1bee2f2b3f869a5053c159";
          sha256 = "sha256-4c9ScQVf55b2ANaR7Lp/oqLeuK+FxH/wKmSNLV+b/CE=";
        };
      }

      # laughedelic/pisces
      {
        name = "pisces";
        src = pkgs.fetchFromGitHub {
          owner = "laughedelic";
          repo = "pisces";
          rev = "e45e0869855d089ba1e628b6248434b2dfa709c4";
          sha256 = "sha256-vlIXBWCQrz2ZlxPhi2/+gweKnT6pcMQQ2NYlysqn7ig=";
        };
      }
    ];
  };
}
