#!/bin/bash
ln -sf ~/src/github.com/dotfiles/.vimrc ~/.vimrc
ln -sf ~/src/github.com/dotfiles/.zshrc ~/.zshrc
ln -sf ~/src/github.com/dotfiles/vim/autoload ~/.vim
ln -sf ~/src/github.com/dotfiles/vim/colors ~/.vim
ln -sf ~/src/github.com/dotfiles/vim/after ~/.vim
ln -sf ~/src/github.com/dotfiles/vim/indent ~/.vim
ln -sf ~/src/github.com/dotfiles/vim/bundle ~/.vim
ln -sf ~/src/github.com/dotfiles/vim/rc ~/.vim
ln -sf ~/src/github.com/dotfiles/.tmux.conf ~/.tmux.conf
ln -sf ~/src/github.com/dotfiles/.gitconfig ~/.gitconfig
ln -sf ~/src/github.com/dotfiles/powerline ~/.config/powerline
ln -sf ~/src/github.com/dotfiles/fish ~/.config/fish
ln -sf ~/src/github.com/dotfiles/.tigrc ~/.tigrc
ln -sf ~/src/github.com/dotfiles/.irbrc ~/.irbrc
ln -sf ~/src/github.com/dotfiles/emacs.d/init.el ~/.emacs.d/init.el
ln -sf ~/src/github.com/dotfiles/nvim/init.vim ~/.config/nvim/init.vim
ln -sf ~/src/github.com/dotfiles/nvim/rc ~/.config/rc

mkdir -p ~/.config/alacritty
ln -sf ~/src/github.com/dotfiles/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml

mkdir -p ~/Library/Developer/Xcode/UserData/FontAndColorThemes/
ln -sf ~/src/github.com/dotfiles/xcode-theme/Material\ Dark.xccolortheme ~/Library/Developer/Xcode/UserData/FontAndColorThemes/Material\ Dark.xccolortheme
