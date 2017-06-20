set -x HOMEBREW_CASK_OPTS "--appdir=/Applications --caskroom=/usr/local/Caskroom"
set -x PATH /usr/local/bin $PATH
set -x JAVA_HOME (/usr/libexec/java_home -v 1.8)
set -x PATH $HOME/Library/Android/sdk/tools $PATH
set -x PATH $HOME/.pyenv/shims $PATH
set -x GOPATH $HOME/go

