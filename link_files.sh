#!/bin/bash
ln -sf ~/src/github.com/mataku/dotfiles/tmux/tmux.conf ~/.tmux.conf
ln -sf ~/src/github.com/mataku/dotfiles/git/gitconfig ~/.gitconfig
ln -sf ~/src/github.com/mataku/dotfiles/tig/tigrc ~/.tigrc
ln -sf ~/src/github.com/mataku/dotfiles/ruby/irbrc ~/.irbrc
ln -sf ~/src/github.com/mataku/dotfiles/nvim/init.lua ~/.config/nvim/init.lua
ln -sfn ~/src/github.com/mataku/dotfiles/nvim/lua/plugins  ~/.config/nvim/lua/plugins
ln -sf ~/src/github.com/mataku/dotfiles/nvim/lua/config/lazy.lua ~/.config/nvim/lua/config/lazy.lua
ln -sf ~/src/github.com/mataku/dotfiles/nvim/lua/config/markdown.lua ~/.config/nvim/lua/config/markdown.lua
ln -sf ~/src/github.com/mataku/dotfiles/wezterm/wezterm.lua ~/.config/wezterm/wezterm.lua
mkdir -p ~/.config/ghostty
ln -sf ~/src/github.com/mataku/dotfiles/ghostty/config ~/.config/ghostty/config
ln -sf ~/src/github.com/mataku/dotfiles/lazygit/config.yml ~/Library/Application\ Support/lazygit/config.yml

# Pre-nix migration: ZDOTDIR must be set in ~/.zshenv (zsh requirement)
# In nix, this is managed by home-manager (see nix/home/default.nix)
echo 'export ZDOTDIR="$HOME/.config/zsh"' > ~/.zshenv
mkdir -p ~/.config/zsh/environments
ln -sf ~/src/github.com/mataku/dotfiles/zsh/.zshrc ~/.config/zsh/.zshrc
ln -sf ~/src/github.com/mataku/dotfiles/zsh/alias.zsh ~/.config/zsh/alias.zsh
ln -sf ~/src/github.com/mataku/dotfiles/zsh/env.zsh ~/.config/zsh/env.zsh
ln -sf ~/src/github.com/mataku/dotfiles/zsh/prompt.zsh ~/.config/zsh/prompt.zsh
ln -sf ~/src/github.com/mataku/dotfiles/zsh/functions.zsh ~/.config/zsh/functions.zsh
ln -sf ~/src/github.com/mataku/dotfiles/zsh/environments/android.zsh ~/.config/zsh/environments/android.zsh
mkdir -p ~/.config/zsh-abbr
ln -sf ~/src/github.com/mataku/dotfiles/zsh/zsh-abbr/user-abbreviations ~/.config/zsh-abbr/user-abbreviations

# Fish configuration
ln -sf ~/src/github.com/mataku/dotfiles/fish/config.fish ~/.config/fish/config.fish
ln -sf ~/src/github.com/mataku/dotfiles/fish/alias.fish ~/.config/fish/alias.fish
ln -sf ~/src/github.com/mataku/dotfiles/fish/env.fish ~/.config/fish/env.fish
mkdir -p ~/.config/fish/environments
ln -sf ~/src/github.com/mataku/dotfiles/fish/environments/android.fish ~/.config/fish/environments/android.fish
ln -sfn ~/src/github.com/mataku/dotfiles/fish/functions ~/.config/fish/functions
ln -sfn ~/src/github.com/mataku/dotfiles/fish/completions ~/.config/fish/completions
ln -sfn ~/src/github.com/mataku/dotfiles/fish/conf.d ~/.config/fish/conf.d

# Claude Code
ln -sf ~/src/github.com/mataku/dotfiles/claude/settings.json ~/.claude/settings.json
mkdir -p ~/.claude/hooks
ln -sf ~/src/github.com/mataku/dotfiles/claude/hooks/permission-notify.sh ~/.claude/hooks/permission-notify.sh
ln -sf ~/src/github.com/mataku/dotfiles/claude/hooks/idle-notify.sh ~/.claude/hooks/idle-notify.sh

# Herdr configuration
mkdir -p ~/.config/herdr
ln -sf ~/src/github.com/mataku/dotfiles/herdr/config.toml ~/.config/herdr/config.toml
