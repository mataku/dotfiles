export LANG=ja_JP.UTF-8
autoload -Uz colors
colors
plugins=(git)

fpath=(/usr/local/share/zsh/site-functions $fpath)

autoload -Uz compinit
compinit -u

function uniq_path ()  { 
  export PATH=`echo -n $PATH | awk -v RS=: -v ORS=: '$0 != "'$1'"' | sed 's/:$//'`; }

setopt no_beep
setopt ignore_eof
setopt print_eight_bit
setopt correct
setopt auto_cd
setopt hist_ignore_dups
setopt hist_no_store
setopt hist_expand
setopt inc_append_history
setopt EXTENDED_HISTORY
# cd -[tab] で移動履歴
setopt auto_pushd

export HOMEBREW_CASK_OPTS="--appdir=/Applications --caskroom=/usr/local/Caskroom"
export PATH=$HOME/.nodebrew/current/bin:$PATH
export PATH=$HOME/sl:$PATH
export PATH=/usr/local/bin:$PATH
export JAVA_HOME=`/usr/libexec/java_home -v 1.8`
export EDITOR=/usr/local/bin/vim
export PATH=$HOME/.cargo/bin:$PATH
export PATH=$HOME/Library/Android/sdk/tools:$PATH

function peco-lscd(){
  local dir="$( ls -1d */ | peco )"
  if [ ! -z "$dir" ] ; then
    cd "$dir"
  fi
}

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
eval "$(rbenv init - zsh)"

if [ -x "`which go`" ]; then
  export GOROOT=`go env GOROOT`
  export GOPATH=$HOME/go
  export PATH=$PATH:$GOROOT/bin:$GOPATH/bin
fi

# To ignore homebrew warning of python installed by pyenv
#alias brew="env PATH=${PATH/\/Users\/rhythnn\/\.pyenv\/shims:/} brew"

export HISTFILE=${HOME}/.zsh_history
export HISTSIZE=1000
export SAVEHIST=100000

bindkey -e
typeset -U path fpath cdpath manpath PATH
PROMPT="[%1~]$ "
PROMPT+=`$([ -n "$TMUX" ] && tmux setenv TMUXPWD_$(tmux display -p "#I_#P") "$PWD")`
RPROMPT=""

function peco-history-selection() {
	BUFFER=`history -n 1 | tail -r  | awk '!a[$0]++' | peco`
	CURSOR=$#BUFFER
	zle reset-prompt
}

zle -N peco-history-selection
bindkey '^R' peco-history-selection
