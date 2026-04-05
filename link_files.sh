#!/bin/bash
ln -sf ~/src/github.com/mataku/dotfiles/.tmux.conf ~/.tmux.conf
ln -sf ~/src/github.com/mataku/dotfiles/.gitconfig ~/.gitconfig
ln -sfn ~/src/github.com/mataku/dotfiles/fish ~/.config/fish
ln -sf ~/src/github.com/mataku/dotfiles/.tigrc ~/.tigrc
ln -sf ~/src/github.com/mataku/dotfiles/.irbrc ~/.irbrc
ln -sf ~/src/github.com/mataku/dotfiles/nvim/init.lua ~/.config/nvim/init.lua
ln -sfn ~/src/github.com/mataku/dotfiles/nvim/lua/plugins  ~/.config/nvim/lua/plugins
ln -sf ~/src/github.com/mataku/dotfiles/nvim/lua/config/lazy.lua ~/.config/nvim/lua/config/lazy.lua
ln -sf ~/src/github.com/mataku/dotfiles/wezterm/wezterm.lua ~/.config/wezterm/wezterm.lua
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
