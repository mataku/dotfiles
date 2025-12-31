{ config, pkgs, ... }:

{
  programs.git = {
    enable = true;

    # User information
    userName = "Takuma Homma";
    userEmail = "nagomimatcha@gmail.com";

    # Git configuration
    extraConfig = {
      # Core settings
      core = {
        editor = "nvim -c 'startinsert'";
        pager = "bat";
      };

      # Color settings
      color = {
        ui = true;
        status = {
          added = "yellow";
          changed = "green";
          untracked = "cyan";
        };
      };

      # Merge settings
      merge = {
        mergepbx = {
          name = "Xcode project files merger";
          driver = "mergepbx %O %A %B";
        };
      };

      # Fetch settings
      fetch = {
        prune = true;
      };

      # Pull settings
      pull = {
        rebase = true;
      };

      # Commit settings
      commit = {
        template = "${config.xdg.configHome}/git/commit_template";
        gpgsign = true;
      };

      # Init settings
      init = {
        defaultBranch = "develop";
      };

      # ghq settings
      ghq = {
        root = "~/src";
      };
    };

    # Git aliases
    aliases = {
      st = "status";
      co = "checkout";
      unstage = "reset HEAD";
      b = "branch";
      al = "config --get-regexp alias.*";
      cm = "commit -v -S";
      wip = "commit -S --allow-empty -m 'WIP'";
      delbr = "branch -D";
      reset-first-commit = "update-ref -d HEAD";

      # Complex aliases using shell functions
      delete-branch = "!f () { git branch | fzf | xargs git branch -D; };f";
      delete-merged-branch = "!f () { git checkout $1; git branch --merged|egrep -v '\\*|develop|master'|xargs git branch -D; };f";
      showpr = "!f() { git log --merges --oneline --reverse --ancestry-path $1...master | grep 'Merge pull request #' | head -n 1; }; f";
      showprdev = "!f() { git log --merges --oneline --reverse --ancestry-path $1...develop | grep 'Merge pull request #' | head -n 1; }; f";
      mkpr = "!f () { branch=$1; if [ -z ${branch} ]; then branch='develop'; fi; hub browse -- compare/${branch}'...'$(git symbolic-ref --short HEAD); };f";
    };

    # Include additional config files
    includes = [
      {
        path = "~/src/github.com/mataku/dotfiles/git/workconfig";
      }
    ];
  };
}
