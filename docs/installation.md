# Installation Guide

This guide walks you through installing the Nix-based dotfiles configuration.

## Prerequisites

- macOS (Apple Silicon or Intel)
- Internet connection
- Git (pre-installed on macOS)
- Admin privileges (for system configuration)

## XDG Base Directory Support

This configuration follows the [XDG Base Directory specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html):

- **Config**: `~/.config/` (XDG_CONFIG_HOME)
- **Data**: `~/.local/share/` (XDG_DATA_HOME)
- **Cache**: `~/.cache/` (XDG_CACHE_HOME)
- **State**: `~/.local/state/` (XDG_STATE_HOME)

Configurations are symlinked to appropriate XDG directories:
- Neovim: `~/.config/nvim/`
- Fish: `~/.config/fish/`
- WezTerm: `~/.config/wezterm/`
- Tig: `~/.config/tig/`
- Lazygit: `~/.config/lazygit/`
- Ripgrep: `~/.config/ripgrep/`
- Git commit template: `~/.config/git/`

Legacy dotfiles (symlinked to home directory):
- Git: `~/.gitconfig`
- IRB: `~/.irbrc`
- Gem: `~/.gemrc`

## Repository Structure

```
dotfiles/
├── flake.nix                      # Main Nix flake configuration
├── flake.lock                     # Locked dependency versions
├── nix/
│   ├── darwin/
│   │   └── configuration.nix      # macOS system settings
│   ├── home/
│   │   ├── default.nix            # Home-manager config (XDG-enabled)
│   │   ├── packages.nix           # Package list (60+ packages)
│   │   └── programs/
│   │       └── fish.nix           # Fish shell config placeholder
│   └── packages/
│       └── font-cica.nix          # Custom Font Cica derivation
├── fish/                          # Fish shell dotfiles (manually managed)
├── nvim/                          # Neovim configuration
├── wezterm/                       # WezTerm configuration
├── lazygit/                       # Lazygit configuration
├── .gitconfig                     # Git configuration (symlinked)
├── scripts/
│   └── install.sh                 # Installation script
└── docs/
    ├── installation.md            # This file
    └── usage.md                   # Usage guide
```

## Fresh Installation

### Step 1: Clone the Repository

```shell
mkdir -p ~/src/github.com/mataku
git clone https://github.com/mataku/dotfiles.git ~/src/github.com/mataku/dotfiles
cd ~/src/github.com/mataku/dotfiles
```

### Step 2: Run the Installation Script

```shell
./scripts/install.sh
```

The script will automatically:
1. Install Nix using the Determinate Systems installer
2. Download necessary Nix packages
3. Build the nix-darwin configuration
4. Activate the system configuration
5. Install all packages (60+ tools)

This process may take 10-30 minutes depending on your internet connection.

### Step 3: Restart Your Terminal

After installation completes, restart your terminal or run:

```shell
exec fish
```

### Step 4: Verify Installation

Check that everything is working:

```shell
# Verify core tools
bat --version
fzf --version
git --version
fish --version
neovim --version

# Verify Nix installation
nix --version
darwin-rebuild --version

# Check that Fish shell works
fish -c 'echo $SHELL'

# Verify direnv integration
direnv --version
```

## Post-Installation Setup

### 1. Install Applications Manually

The following applications cannot be managed by Nix and need manual installation:

**Via Mac App Store** (or use `mas` CLI):
```shell
# Install using mas CLI (included in Nix packages)
mas install 497799835   # Xcode
mas install 937984704   # Amphetamine
mas install 409183694   # Keynote
mas install 409203825   # Numbers
mas install 409201541   # Pages
mas install 425424353   # The Unarchiver
```

**Direct Download Required**:
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

### 2. Set Up Rust Toolchain (Optional)

```shell
rustup default stable
rustup component add rust-analyzer
rustup component add rustfmt
rustup component add clippy
```

### 3. Install Flutter (Optional)

Flutter is not managed by Nix. Follow the official installation guide:

1. Download Flutter SDK: https://docs.flutter.dev/get-started/install/macos
2. Extract to your preferred location (e.g., `~/development/flutter`)
3. Add to PATH in a per-project shell.nix or globally in [nix/home/default.nix](../nix/home/default.nix)

```shell
# Verify installation
flutter doctor
```

### 4. Configure Private Settings

Create optional configuration files for private settings:

```shell
# GitHub personal access token (optional, for private repositories)
echo "set -x GITHUB_TOKEN your_token_here" > ~/.config/fish/github_access_token.fish

# Work-specific configuration (optional)
touch ~/.config/fish/work.fish

# Android environment variables are configured in:
# ~/.config/fish/environments/android.fish (already symlinked)
# Edit the source file in the dotfiles repository if needed
```

## Updating the System

### Update All Packages

```shell
cd ~/src/github.com/mataku/dotfiles

# Update flake inputs (nixpkgs, home-manager, nix-darwin)
nix flake update

# Rebuild and activate
darwin-rebuild switch --flake .#macos
```

### Update Specific Input

```shell
# Update only nixpkgs
nix flake lock --update-input nixpkgs

# Rebuild
darwin-rebuild switch --flake .#macos
```

### Rollback to Previous Version

If an update causes issues:

```shell
# List available generations
darwin-rebuild --list-generations

# Rollback to previous generation
darwin-rebuild --rollback

# Or switch to specific generation
darwin-rebuild --switch-generation <number>
```

## Adding New Packages

### Step 1: Find the Package

Search for packages in nixpkgs:

```shell
# Search from command line
nix search nixpkgs <package-name>

# Or use the web interface
# https://search.nixos.org/packages
```

### Step 2: Add to Configuration

Edit [nix/home/packages.nix](../nix/home/packages.nix):

```nix
home.packages = with pkgs; [
  # ... existing packages ...
  newpackage  # Add your package here
];
```

### Step 3: Rebuild

```shell
darwin-rebuild switch --flake ~/src/github.com/mataku/dotfiles#macos
```

## Troubleshooting

### Installation Failed

If the installation script fails:

1. Check internet connection
2. View error messages carefully
3. Try running individual steps manually:

```shell
# Install Nix manually
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# Source Nix environment
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh

# Try building without activation
nix build ~/src/github.com/mataku/dotfiles#darwinConfigurations.macos.system

# If build succeeds, activate
nix run nix-darwin --extra-experimental-features "nix-command flakes" -- switch --flake ~/src/github.com/mataku/dotfiles#macos
```

### Fish Shell Not Loading

If Fish shell doesn't start properly:

```shell
# Check if Fish is installed
which fish

# Check Fish configuration
fish --debug

# Verify Fish is in /etc/shells
cat /etc/shells | grep fish

# Set Fish as default shell
chsh -s $(which fish)
```

### Packages Not Found

If commands are not found after installation:

```shell
# Check if package is installed
nix-env -q

# Source Fish environment
exec fish

# Check PATH
echo $PATH

# Verify Nix profile is loaded
ls -la ~/.nix-profile/bin/
```

### Permission Issues

If you encounter permission errors:

```shell
# Ensure you're in the admin group
groups | grep admin

# Check Nix daemon is running
sudo launchctl list | grep nix-daemon

# Restart Nix daemon
sudo launchctl kickstart -k system/org.nixos.nix-daemon
```

### Build Errors

If builds fail due to missing dependencies:

```shell
# Clear build cache
nix-collect-garbage -d

# Try building with verbose output
darwin-rebuild switch --flake .#macos --show-trace

# Check for syntax errors in Nix files
nix flake check
```

## Uninstalling

If you need to uninstall Nix and return to Homebrew:

```shell
# 1. Uninstall Nix-Darwin
sudo rm -rf /etc/nix /etc/bashrc /etc/zshrc /etc/static

# 2. Uninstall Nix (using Determinate Systems uninstaller)
/nix/nix-installer uninstall

# 3. Reinstall Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 4. Restore to Homebrew-based dotfiles
cd ~/src/github.com/mataku/dotfiles
git checkout develop  # Or the Homebrew-based branch
./setup.sh
```

## Next Steps

- Read [Usage Guide](./usage.md) for daily workflows
- Check [Configuration Structure](./configuration.md) to understand the codebase
- See [Migration Guide](./migration.md) if you're migrating from an existing setup

## Getting Help

- Check the [Troubleshooting](#troubleshooting) section above
- Review Nix documentation: https://nix.dev
- Review nix-darwin manual: https://daiderd.com/nix-darwin/manual/
- Review home-manager manual: https://nix-community.github.io/home-manager/
- Open an issue on GitHub
