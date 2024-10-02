#!/bin/bash
ln -sf ~/src/github.com/mataku/dotfiles/.tmux.conf ~/.tmux.conf
ln -sf ~/src/github.com/mataku/dotfiles/.gitconfig ~/.gitconfig
ln -sf ~/src/github.com/mataku/dotfiles/fish ~/.config/fish
ln -sf ~/src/github.com/mataku/dotfiles/.tigrc ~/.tigrc
ln -sf ~/src/github.com/mataku/dotfiles/.irbrc ~/.irbrc
ln -sf ~/src/github.com/mataku/dotfiles/nvim/init.vim ~/.config/nvim/init.vim
ln -sf ~/src/github.com/mataku/dotfiles/nvim/rc/dein.toml ~/.config/nvim/rc/dein.toml
ln -sf ~/src/github.com/mataku/dotfiles/nvim/rc/dein_lazy.toml ~/.config/nvim/rc/dein_lazy.toml
ln -sf ~/src/github.com/mataku/dotfiles/nvim/coc/package.json ~/.config/coc/extensions/package.json
ln -sf ~/src/github.com/mataku/dotfiles/wezterm/wezterm.lua ~/.config/wezterm/wezterm.lua

mkdir -p ~/Library/Developer/Xcode/UserData/FontAndColorThemes/
ln -sf ~/src/github.com/mataku/dotfiles/xcode-theme/Material\ Dark.xccolortheme ~/Library/Developer/Xcode/UserData/FontAndColorThemes/Material\ Dark.xccolortheme
