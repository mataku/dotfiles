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
darwin-rebuild switch --flake ~/src/github.com/mataku/dotfiles#mataku-macbook
```

### Removing Packages

Remove from [nix/home/packages.nix](../nix/home/packages.nix) and rebuild.

### Updating Packages

```shell
cd ~/src/github.com/mataku/dotfiles

# Update all inputs
nix flake update

# Rebuild system
darwin-rebuild switch --flake .#mataku-macbook
```

## Language Version Management

### Global Versions

Configured in [nix/home/packages.nix](../nix/home/packages.nix):
- Node.js: `nodejs_20`
- Ruby: `ruby_3_2`
- Go: `go`

To change, edit the package name and rebuild.

### Per-Project Versions (Recommended)

Use direnv + shell.nix for project-specific versions:

1. Create `shell.nix`:
```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_18
    ruby_3_1
    postgresql_14
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

Edit [nix/home/programs/git.nix](../nix/home/programs/git.nix), then rebuild.

### Fish Shell

Edit [nix/home/programs/fish.nix](../nix/home/programs/fish.nix), then rebuild and restart Fish:
```shell
darwin-rebuild switch --flake .#mataku-macbook
exec fish
```

### Environment Variables

Edit [nix/home/default.nix](../nix/home/default.nix) → `home.sessionVariables`, then rebuild.

### System Preferences

Edit [nix/darwin/configuration.nix](../nix/darwin/configuration.nix) → `system.defaults`, then rebuild.

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

## Fish Shell

### FZF History

Press `Ctrl+R` to search command history with FZF.

### z for Directory Jumping

```shell
z dotfiles    # Jump to frecent directory
z -l src      # List matching directories
```

### ghq for Git Repositories

```shell
ghq get github.com/user/repo   # Clone to ~/src
ghq list                         # List repos
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
nix build .#darwinConfigurations.mataku-macbook.system
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
