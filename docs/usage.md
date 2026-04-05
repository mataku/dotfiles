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

Git is configured via `.gitconfig` in the repository root, which is symlinked to `~/.gitconfig`. Edit the file directly:

```shell
# Edit Git configuration
vim ~/src/github.com/mataku/dotfiles/.gitconfig

# Changes take effect immediately (no rebuild needed)
```

### Fish Shell

Fish shell configuration files are symlinked from the `fish/` directory. Edit them directly:

```shell
# Edit Fish configuration
vim ~/src/github.com/mataku/dotfiles/fish/config.fish
vim ~/src/github.com/mataku/dotfiles/fish/alias.fish
vim ~/src/github.com/mataku/dotfiles/fish/env.fish

# Reload Fish to apply changes
exec fish
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
- Tig: `.tigrc`
- Ripgrep: `.ripgreprc`

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

## Fish Shell Features

Fish shell configuration is managed manually via symlinked files. Install plugins using Fisher or your preferred plugin manager.

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
exec fish
```

For more details, see [Installation Guide](installation.md).
