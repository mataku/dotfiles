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
          commandline ''
        end
      end

      # Key bindings for FZF history (Ctrl+R)
      function fish_user_key_bindings
        bind \cr fzf_select_history
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
          rev = "85967166425d49f32d44b6328a1c5a4d6d0d3e9e";
          sha256 = "sha256-CCrajFLeVpCpBOJM3x9Fjp/6u3T1cLd9d4X3+O8KeUI=";
        };
      }

      # 0rax/fish-bd
      {
        name = "fish-bd";
        src = pkgs.fetchFromGitHub {
          owner = "0rax";
          repo = "fish-bd";
          rev = "d1e9096b1e4f0d4a12f8d63a4f2a0f2c4f1e8f91";
          sha256 = "sha256-baR08W8LsJwdVfN+Wu7LNc+ca7S7gJ5HtJm1BbWnFBM=";
        };
      }

      # oh-my-fish/plugin-expand
      {
        name = "plugin-expand";
        src = pkgs.fetchFromGitHub {
          owner = "oh-my-fish";
          repo = "plugin-expand";
          rev = "8d7d926c7b4fa61a54a95e393cf4d5f33a39eb0e";
          sha256 = "sha256-wj/fQ20w8PU1eRBGK2u+aVK7kIHv64vL8MIy5N3E9Gs=";
        };
      }

      # oh-my-fish/plugin-extract
      {
        name = "plugin-extract";
        src = pkgs.fetchFromGitHub {
          owner = "oh-my-fish";
          repo = "plugin-extract";
          rev = "8b645bb5e8c8c608f7b7a8d888f1b8e8f2cc81f0";
          sha256 = "sha256-Lw/SYlFA1c1kR/pkJlcfKZGGW/9kBxGMrFp7FDPZwXM=";
        };
      }

      # fisherman/getopts
      {
        name = "getopts";
        src = pkgs.fetchFromGitHub {
          owner = "jorgebucaran";
          repo = "getopts.fish";
          rev = "3c2c1c28af89ec336a6b737ce19c4e5a61b5e6d2";
          sha256 = "sha256-yJQb1M3o8FvxA9ILRCMHWJzPn8ZdqDHkV3gPCLLLULs=";
        };
      }

      # decors/fish-ghq
      {
        name = "fish-ghq";
        src = pkgs.fetchFromGitHub {
          owner = "decors";
          repo = "fish-ghq";
          rev = "af18a5f7eb0797c3ea54d4f45440d119aeca03f2";
          sha256 = "sha256-84rXEsPDAKANwQO3TuDvgLv9Dm9LwPSSbmJDCm5VEFQ=";
        };
      }

      # fisherman/spin
      {
        name = "spin";
        src = pkgs.fetchFromGitHub {
          owner = "jorgebucaran";
          repo = "fish-spin";
          rev = "a58579802e99d5f5ec0cd2ad5cd9c4fd92adfc59";
          sha256 = "sha256-3kkWqUwLXkPJmZBBQe/bYVGGkSBJsO7sJYqzNkFTJ/U=";
        };
      }

      # jethrokuan/z
      {
        name = "z";
        src = pkgs.fetchFromGitHub {
          owner = "jethrokuan";
          repo = "z";
          rev = "85f863f20f24faf675827fb00f3a4e15c7838d76";
          sha256 = "sha256-+FUBM7CodtZrYKqU542fQD+ZDGrd2438trKM0tIESs0=";
        };
      }

      # laughedelic/pisces
      {
        name = "pisces";
        src = pkgs.fetchFromGitHub {
          owner = "laughedelic";
          repo = "pisces";
          rev = "e45e0869855bc7e6519b8a25c8e0696e859e4052";
          sha256 = "sha256-Oou2IeNNAqR00ZT3bss/DbhrJjGeMsn9dBBYhgdafBw=";
        };
      }
    ];
  };

  # Note: rbenv and nodenv init are NOT included
  # Ruby and Node.js are managed declaratively via Nix (ruby_3_2, nodejs_20)
  # Use direnv + shell.nix for per-project version management
}
