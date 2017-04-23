function set_path
  set -x HOMEBREW_CASK_OPTS "--appdir=/Applications --caskroom=/usr/local/Caskroom"
  set -x PATH $HOME/.nodebrew/current/bin $PATH
  set -x PATH $HOME/sl $PATH
  set -x PATH /usr/local/bin $PATH
  set -x JAVA_HOME (/usr/libexec/java_home -v 1.8)
  set -x EDITOR /usr/local/bin/vim
  set -x PATH $HOME/.cargo/bin $PATH
  set -x PATH $HOME/Library/Android/sdk/tools $PATH
end
