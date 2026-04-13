# Usage Guide

Common workflows and patterns for managing your Nix-based dotfiles.

## Package Management

### Adding New Packages

1. Search for the package:
```shell
nix search nixpkgs <package-name>
# Or use: https://search.nixos.org/packages
```

2. Edit [nix/home/packages.nix](../nix/home/packages.nix):
```nix
home.packages = with pkgs; [
  # ... existing packages ...
  new-package  # Add here
];
```

3. Rebuild:
```shell
darwin-rebuild switch --flake ~/src/github.com/mataku/dotfiles#macos
```

### Removing Packages

Remove from [nix/home/packages.nix](../nix/home/packages.nix) and rebuild.

### Updating Packages

```shell
cd ~/src/github.com/mataku/dotfiles

# Update all inputs
nix flake update

# Rebuild system
darwin-rebuild switch --flake .#macos
```

## Language Version Management

### Global Versions

Configured in [nix/home/packages.nix](../nix/home/packages.nix):
- Node.js: managed via `nodenv` (not installed through Nix)
- Go: `go`
- Java: `temurin-bin-17` (managed via `programs.java`)

To change, edit the package name and rebuild.

### Per-Project Versions (Recommended)

Use direnv + shell.nix for project-specific versions:

1. Create `shell.nix`:
```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_18      # Different Node.js version
    temurin-bin-11 # Different Java version
    postgresql_14  # Database
  ];
}
```

2. Create `.envrc`:
```shell
use nix
```

3. Allow direnv:
```shell
direnv allow
```

Environment activates automatically when you `cd` into the directory.

## Configuration Updates

### Git Configuration

Git is configured via `git/gitconfig`, which is symlinked to `~/.gitconfig`. Edit the file directly:

```shell
# Edit Git configuration
vim ~/src/github.com/mataku/dotfiles/git/gitconfig

# Changes take effect immediately (no rebuild needed)
```

### Zsh Shell

Zsh shell configuration files are symlinked from the `zsh/` directory. Edit them directly:

```shell
# Edit Zsh configuration
vim ~/src/github.com/mataku/dotfiles/zsh/.zshrc
vim ~/src/github.com/mataku/dotfiles/zsh/alias.zsh
vim ~/src/github.com/mataku/dotfiles/zsh/env.zsh

# Reload Zsh to apply changes
exec zsh
```

### Neovim Configuration

Neovim configuration is symlinked from the `nvim/` directory:

```shell
# Edit Neovim configuration
vim ~/src/github.com/mataku/dotfiles/nvim/init.lua

# Changes take effect on next Neovim restart
```

### Other Dotfiles

Most dotfiles are symlinked and can be edited directly:
- WezTerm: `wezterm/wezterm.lua`
- Lazygit: `lazygit/config.yml`
- Tig: `tig/tigrc`
- Ripgrep: `ripgrep/ripgreprc`
- Tmux: `tmux/tmux.conf`
- Ruby (IRB/Gem): `ruby/irbrc`, `ruby/gemrc`

Changes take effect immediately or after restarting the application.

### Environment Variables

For system-wide environment variables, edit [nix/home/default.nix](../nix/home/default.nix) → `home.sessionVariables`, then rebuild:

```shell
darwin-rebuild switch --flake .#macos
```

### System Preferences

macOS system settings are managed in [nix/darwin/configuration.nix](../nix/darwin/configuration.nix). Edit `system.defaults` section and rebuild:

```shell
darwin-rebuild switch --flake .#macos
```

## Common Tasks

### Rollback Configuration

```shell
darwin-rebuild --rollback
```

### List Generations

```shell
darwin-rebuild --list-generations
```

### Garbage Collection

```shell
# Remove old generations
nix-collect-garbage -d

# Or keep last 7 days
nix-collect-garbage --delete-older-than 7d
```

### Check Disk Usage

```shell
du -sh /nix/store
```

## Zsh Shell Features

Zsh shell configuration is managed manually via symlinked files. Plugins are managed with zinit in `.zshrc`.

### Common Commands

```shell
# ghq for Git repository management
ghq get github.com/user/repo   # Clone to ~/src
ghq list                         # List all repositories

# bat for better cat
bat README.md                    # Syntax-highlighted file view

# fd for better find
fd pattern                       # Fast file search

# ripgrep for better grep
rg pattern                       # Fast code search

# lsd for better ls
lsd -la                          # Colorful directory listing
```

## Tmux

Prefix: `Ctrl+Q`

- Split horizontal: `Prefix + |`
- Split vertical: `Prefix + -`
- Reload config: `Prefix + r`

## Git Aliases

```shell
git st        # status
git co        # checkout
git cm        # commit -v -S
git wip       # commit --allow-empty -m 'WIP'
```

## Manual Applications

Applications that cannot be managed by Nix and need manual installation.

**Via Mac App Store** (the `mas` CLI is included in Nix packages):

```shell
mas install 497799835   # Xcode
mas install 937984704   # Amphetamine
mas install 409183694   # Keynote
mas install 409203825   # Numbers
mas install 409201541   # Pages
mas install 425424353   # The Unarchiver
```

**Direct download required:**

- Vivaldi (https://vivaldi.com/)
- Android Studio (https://developer.android.com/studio)
- Visual Studio Code (https://code.visualstudio.com/)
- WezTerm (https://wezfurlong.org/wezterm/)
- Discord (https://discord.com/)
- Raycast (https://raycast.com/)
- Logicool Options+ (https://www.logicool.co.jp/ja-jp/software/logi-options-plus.html)
- Google IME (https://www.google.co.jp/ime/)
- Spotify (https://www.spotify.com/)
- Karabiner-Elements (https://karabiner-elements.pqrs.org/)
- Slack (https://slack.com/)

## Private Settings

Optional configuration files for private / machine-local settings. These paths live under `~/.config/zsh/` (via `ZDOTDIR`) and are sourced from `.zshrc`.

```shell
# GitHub personal access token (optional, for private repositories)
echo 'export GITHUB_TOKEN=your_token_here' > ~/.config/zsh/github_access_token.zsh

# Work-specific configuration (optional)
touch ~/.config/zsh/work.zsh

# Android environment variables are configured in:
# ~/.config/zsh/environments/android.zsh (already symlinked)
# Edit the source file in the dotfiles repository if needed
```

## Troubleshooting

### Rebuild Failed

```shell
# Check configuration syntax
nix flake check

# Build without activating
nix build .#darwinConfigurations.macos.system
```

### Package Not Found

```shell
# Verify installation
which <command>

# Check PATH
echo $PATH

# Reload shell
exec zsh
```

### Zsh Not Set as Default Shell

```shell
# Check if Zsh is installed
which zsh

# Verify Zsh is in /etc/shells (nix-darwin adds ~/.nix-profile/bin/zsh automatically)
cat /etc/shells | grep zsh

# Set Zsh as default shell
chsh -s ~/.nix-profile/bin/zsh
```
