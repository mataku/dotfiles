export LANG=ja_JP.UTF-8
autoload -Uz colors
colors
plugins=(git)
#
#ZSH_THEME="default"
if [ -e "${HOME}/.zplug" ]; then
  . ~/.zplug/zplug
  # githubのレポジトリを指定し, of以下でいるファイル指定
  zplug "plugins/git", from:oh-my-zsh
  zplug "jeremyFreeAgent/oh-my-zsh-powerline-theme", of:powerline.zsh-theme
	if ! zplug check --verbose; then
		printf "Install? [y/N]: "
		if read -q; then
			echo; zplug install
		fi
	fi

  zplug load 
fi
# POWERLEVEL9K_MODE='compatible'
#
function path_remove ()  { 
  export PATH=`echo -n $PATH | awk -v RS=: -v ORS=: '$0 != "'$1'"' | sed 's/:$//'`; }

echo -ne "\033]0;$(pwd | rev | awk -F \/ '{print "/"$1"/"$2}'| rev)\007"
function chpwd() { echo -ne "\033]0;$(pwd | rev | awk -F \/ '{print "/"$1"/"$2}'| rev)\007"}


alias vi="vim"
alias grep="ggrep"


fpath=(/usr/local/share/zsh-completions $fpath)
typeset -U path fpath cdpath manpath
setopt no_beep
setopt ignore_eof
setopt print_eight_bit


export HOMEBREW_CASK_OPTS="--appdir=/Applications --caskroom=/usr/local/Caskroom"
export PATH=$HOME/.nodebrew/current/bin:$PATH
export PATH=$HOME/sl:$PATH
export PATH=/usr/local/bin:$PATH
export JAVA_HOME=`/usr/libexec/java_home -v 1.8`
export PATH=/Library/TeX/texbin:$PATH
export EDITOR=/usr/local/bin/vim


# docker
#export DOCKER_TLS_VERIFY=1
#export DOCKER_HOST=tcp://192.168.99.100:2376
#export DOCKER_CERT_PATH=/Users/rhythnn/.docker/machine/machines/test-machine
#export DOCKER_MACHINE_NAME=test-machine

alias dl='docker ps -l -q'
alias pip3_upgrade="pip3 list --outdated | awk '{print \$1}' | xargs pip3 install -U"

PROMPT="%n:%c%# "
alias ls="ls -G"
alias sudo='sudo '
alias sed="gsed"

function peco-lscd(){
  local dir="$( ls -1d */ | peco )"
  if [ ! -z "$dir" ] ; then
    cd "$dir"
  fi
}

export PATH="$HOME/Workspace/sl:$PATH"

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
alias brew="env PATH=${PATH/\/Users\/rhythnn\/\.pyenv\/shims:/} brew"


#powerline
# export PATH=$HOME/Library/Python/3.5/bin
# powerline-daemon -q
# #source ~/Library/Python/3.5/lib/python/site-packages/powerline/bindings/zsh/powerline.zsh
source /usr/local/lib/python3.5/site-packages/powerline/bindings/zsh/powerline.zsh
#
# function _update_ps1()
# {
#   export PROMPT="$(~/powerline-zsh.py $?)"
# }
#
# precmd()
# {
#   _update_ps1
# }
#

fpath=(/usr/local/share/zsh-completions $fpath)
autoload -U compinit
compinit -u

export HISTFILE=${HOME}/.zsh_history
# 
export HISTSIZE=1000

export SAVEHIST=100000

setopt hist_ignore_dups

setopt EXTENDED_HISTORY

typeset -U path PATH

