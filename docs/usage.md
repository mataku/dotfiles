# Usage Guide

Common workflows for managing these dotfiles with Homebrew and mise.

## Package Management

Packages live in `Brewfile`. Apply it with:

```shell
cd ~/src/github.com/mataku/dotfiles
brew bundle
```

### Adding a package

1. `brew install <formula>` (or `brew install --cask <cask>`).
2. `make dump` to regenerate `Brewfile` from the machine, then review the diff and drop anything you do not want to keep.

### Updating packages

```shell
brew update && brew upgrade
```

### Checking the Brewfile

```shell
brew bundle check --verbose
```

## Dotfiles and macOS Defaults

`mise.toml` at the repository root declares the symlinks under `[dotfiles]` and the preferences under `[bootstrap.macos.defaults]`. It is a project config, so run mise from the repository directory.

```shell
cd ~/src/github.com/mataku/dotfiles
mise bootstrap dotfiles status
mise bootstrap macos defaults status
mise bootstrap --yes
```

`mise bootstrap` only changes what differs. Dock and Finder are restarted by the `post-defaults` hook; keyboard and trackpad changes need a logout.

### Adding a dotfile

Add a line to `[dotfiles]` with the target path as the key and the repository-relative source as the value, then run `mise bootstrap --yes`.

### Changing a preference

Find the domain and key with `defaults read <domain>` and the type with `defaults read-type <domain> <key>`. Write the value with the same type (`38.0` for a float, `38` for an integer).

## Full setup

```shell
./scripts/install.sh
```

This is idempotent and is what CI runs. It installs Homebrew, applies the Brewfile, installs mise, runs `mise bootstrap`, and prints the manual-install list.

`setup.sh` is the curl entrypoint for a new machine. It runs `install.sh` and then the one-time sudo steps: mute the startup chime (`nvram StartupMute`), enable Touch ID for sudo (`/etc/pam.d/sudo_local`), and make fish the login shell.

## Configuration Updates

Every config file is a symlink into this repository, so edit the file in the repository and the change is live.

| Tool | File |
|---|---|
| Git | `git/gitconfig` |
| Zsh | `zsh/.zshrc`, `zsh/alias.zsh`, `zsh/env.zsh` |
| Fish | `fish/config.fish`, `fish/alias.fish`, `fish/env.fish` |
| Neovim | `nvim/init.lua`, `nvim/lua/` |
| WezTerm | `wezterm/wezterm.lua` |
| Ghostty | `ghostty/config` |
| herdr | `herdr/config.toml` |
| Lazygit | `lazygit/config.yml` |
| Tig | `tig/tigrc` |
| Ripgrep | `ripgrep/ripgreprc` |
| Ruby (IRB/Gem) | `ruby/irbrc`, `ruby/gemrc` |

## Manual Applications

Installed by hand; `install.sh` prints this list at the end.

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
- azooKey (https://azookey.com/macOS)
- 1Password (https://1password.com/)
- Claude Code (https://docs.claude.com/claude-code). The Homebrew formula lags behind releases, so use the native installer.

Mac App Store apps are `mas` entries in `Brewfile` and need the App Store signed in.

## Private Settings

Optional files sourced by the shell configs if present:

```shell
echo 'export GITHUB_TOKEN=your_token_here' > ~/.config/zsh/github_access_token.zsh
touch ~/.config/zsh/work.zsh
touch ~/.config/fish/work.fish
```

## Migrating an Existing Machine

`mise bootstrap` refuses to replace a regular file or directory with a symlink and stops with the list of conflicting paths. For each one, either move it aside:

```shell
mv ~/.config/fish/config.fish ~/.config/fish/config.fish.bak
```

or let mise replace it (this deletes directory targets such as `~/.config/fish/functions`):

```shell
mise bootstrap dotfiles apply --force --yes
```

Then run `./scripts/install.sh` again. If mise is older than `min_version` in `mise.toml`, run `mise self-update` first.

## Uninstalling Nix

Not scripted. Follow the uninstall steps in the Nix manual for the multi-user macOS installer, then restore the shell files nix-darwin moved aside:

```shell
sudo mv /etc/zshrc.before-nix-darwin /etc/zshrc
sudo mv /etc/bashrc.before-nix-darwin /etc/bashrc
```

## Troubleshooting

### A symlink points to the wrong place

```shell
mise bootstrap dotfiles status
mise bootstrap dotfiles apply --yes
```

### Package not found after install

```shell
which <command>
echo $PATH
exec fish
```

### Fish is not the login shell

```shell
grep /opt/homebrew/bin/fish /etc/shells
chsh -s /opt/homebrew/bin/fish
```
