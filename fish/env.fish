set -x HOMEBREW_CASK_OPTS "--appdir=/Applications"
set -x PATH /usr/local/bin $PATH
set -x PATH $HOME/.nodenv/shims $PATH

if test (uname -m) = 'arm64'
  set -x PATH /opt/homebrew/bin $PATH
end
# set -x JAVA_HOME (/usr/libexec/java_home -v 1.8)
set -x PATH $HOME/Library/Android/sdk/tools $PATH
set -x GOPATH $HOME/go
set -x EDITOR "nvim"
set fish_greeting ""
set -x HOMEBREW_NO_AUTO_UPDATE 1
# set -x PATH $HOME/src/github.com/flutter/flutter/bin $PATH
set -x LANG ja_JP.UTF-8
# https://fishshell.com/docs/current/index.html#variables-color
set fish_color_command normal
# https://www.materialui.co/colors
set fish_color_error FF7043

set -x FZF_DEFAULT_OPTS '--cycle --ansi --select-1 --exit-0'
set -x FZF_DEFAULT_COMMAND 'fd --type f --hidden --follow --exclude .git'


. ~/.config/fish/environments/android.fish

if test -e /opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.fish.inc
  . "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.fish.inc"
end
