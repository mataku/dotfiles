source "$ZDOTDIR/env.zsh"
source "$ZDOTDIR/alias.zsh"
source "$ZDOTDIR/prompt.zsh"
source "$ZDOTDIR/functions.zsh"

ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
[ ! -d "$ZINIT_HOME" ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "$ZINIT_HOME/zinit.zsh"
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions

setopt GLOB_DOTS

autoload -Uz compinit && compinit

LISTMAX=500
zstyle ':completion:*' menu select
zstyle ':completion:*' list-prompt '%SAt %p: Hit TAB for more%s'

eval "$(rbenv init - zsh)"
eval "$(nodenv init - zsh)"

[ -f "$ZDOTDIR/github_access_token.zsh" ] && source "$ZDOTDIR/github_access_token.zsh" || true
[ -f "$ZDOTDIR/work.zsh" ] && source "$ZDOTDIR/work.zsh" || true
[ -f "$ZDOTDIR/android_env.zsh" ] && source "$ZDOTDIR/android_env.zsh" || true
