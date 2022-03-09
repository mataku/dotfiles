#!/bin/bash
ln -sf ~/src/github.com/mataku/dotfiles/.vimrc ~/.vimrc
ln -sf ~/src/github.com/mataku/dotfiles/.zshrc ~/.zshrc
ln -sf ~/src/github.com/mataku/dotfiles/vim/autoload ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/vim/colors ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/vim/after ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/vim/indent ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/vim/bundle ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/vim/rc ~/.vim
ln -sf ~/src/github.com/mataku/dotfiles/.tmux.conf ~/.tmux.conf
ln -sf ~/src/github.com/mataku/dotfiles/.gitconfig ~/.gitconfig
ln -sf ~/src/github.com/mataku/dotfiles/powerline ~/.config/powerline
ln -sf ~/src/github.com/mataku/dotfiles/fish ~/.config/fish
ln -sf ~/src/github.com/mataku/dotfiles/.tigrc ~/.tigrc
ln -sf ~/src/github.com/mataku/dotfiles/.irbrc ~/.irbrc
ln -sf ~/src/github.com/mataku/dotfiles/emacs.d/init.el ~/.emacs.d/init.el
ln -sf ~/src/github.com/mataku/dotfiles/nvim/init.vim ~/.config/nvim/init.vim
ln -sf ~/src/github.com/mataku/dotfiles/nvim/rc ~/.config/nvim/rc
ln -sf ~/src/github.com/mataku/dotfiles/nvim/coc/package.json ~/.config/coc/extensions/package.json

mkdir -p ~/.config/alacritty
ln -sf ~/src/github.com/mataku/dotfiles/alacritty/alacritty.yml ~/.config/alacritty/alacritty.yml

mkdir -p ~/Library/Developer/Xcode/UserData/FontAndColorThemes/
ln -sf ~/src/github.com/mataku/dotfiles/xcode-theme/Material\ Dark.xccolortheme ~/Library/Developer/Xcode/UserData/FontAndColorThemes/Material\ Dark.xccolortheme
