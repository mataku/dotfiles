set -x HOMEBREW_CASK_OPTS "--appdir=/Applications"
set -x PATH /usr/local/bin $PATH
set -x GOPATH $HOME/go
set -x EDITOR "emacsclient -nw -t"
set fish_greeting ""
set -x HOMEBREW_NO_AUTO_UPDATE 1
set -x PATH $HOME/src/github.com/flutter/flutter/bin $PATH
set -x LANG ja_JP.UTF-8
# https://fishshell.com/docs/current/index.html#variables-color
set fish_color_command normal
# https://www.materialui.co/colors
set fish_color_error FF7043

. ~/.config/fish/environments/android.fish
