set -x HOMEBREW_CASK_OPTS "--appdir=/Applications"
set -x PATH /usr/local/bin $PATH
set -x JAVA_HOME (/usr/libexec/java_home -v 1.8)
set -x PATH $HOME/Library/Android/sdk/tools $PATH
set -x GOPATH $HOME/go
set -x EDITOR "emacsclient -nw -t"
set -x PATH $HOME/Library/Android/sdk/platform-tools $PATH
set -x PATH $HOME/Library/Android/sdk/tools/bin $PATH
set fish_greeting ""
set -x HOMEBREW_NO_AUTO_UPDATE 1
set -x ANDROID_HOME $HOME/Library/Android/sdk
set -x PATH $HOME/Library/Android/sdk/build-tools/28.0.2 $PATH
set -x LANG ja_JP.UTF-8
set fish_color_command normal
# https://www.materialui.co/colors
set fish_color_error FF7043
