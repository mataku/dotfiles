export LANG=ja_JP.UTF-8
autoload -Uz colors
colors
plugins=(git)

# fpath=(/usr/local/share/zsh-completions $fpath)
fpath=(/usr/local/share/zsh/site-functions $fpath)

autoload -Uz compinit
compinit -u

if [ -e "${HOME}/.zplug" ]; then
  source ~/.zplug/init.zsh

  # oh-my-zsh の plugin をそのまま持ってこれる
  zplug "plugins/git", from:oh-my-zsh

  # githubのレポジトリを指定し, "of"以下で必要なファイル指定
  #zplug "rhythnn/oh-my-zsh-powerline-theme", use:powerline.zsh-theme
  #zplug "carloscuesta/materialshell", use:zsh/materialshelloceanic.zsh-theme

  if ! zplug check --verbose; then
    printf "Install? [y/N]: "
    if read -q; then
      echo; zplug install
    fi
  fi
fi

function uniq_path ()  { 
  export PATH=`echo -n $PATH | awk -v RS=: -v ORS=: '$0 != "'$1'"' | sed 's/:$//'`; }

alias grep="ggrep"
alias be="bundle exec"
alias de="docker exec"
alias gpush='git push --set-upstream origin $(current_branch)'
alias v='vim'
alias dl='docker ps -l -q'
alias pip3_upgrade="pip3 list --outdated | awk '{print \$1}' | xargs pip3 install -U"
alias ls="ls -G"
alias sudo='sudo '
alias sed="gsed"
alias bi="bundle install -j4"

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

#export PATH="$HOME/Workspace/sl:$PATH"

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
eval "$(rbenv init - zsh)"

# export SCALAENV_ROOT=/usr/local/var/scalaenv
# eval "$(scalaenv init -)"

if [ -x "`which go`" ]; then
  export GOROOT=`go env GOROOT`
  export GOPATH=$HOME/go
  export PATH=$PATH:$GOROOT/bin:$GOPATH/bin
fi

# To ignore homebrew warning of python installed by pyenv
#alias brew="env PATH=${PATH/\/Users\/rhythnn\/\.pyenv\/shims:/} brew"

source /usr/local/lib/python3.6/site-packages/powerline/bindings/zsh/powerline.zsh
zplug load

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

function _update_vcs_info_msg() {
  PROMPT="%{[38;5;208m%}[$] %{[0m%}"

  PROMPT+=`$([ -n "$TMUX" ] && tmux setenv TMUXPWD_$(tmux display -p "#I_#P") "$PWD")`
}
add-zsh-hook precmd _update_vcs_info_msg

# zsh 起動時に tmux 起動
[[ -z "$TMUX" && ! -z "$PS1" ]] && tmux

# added by travis gem
[ -f /Users/rhythnn/.travis/travis.sh ] && source /Users/rhythnn/.travis/travis.sh
