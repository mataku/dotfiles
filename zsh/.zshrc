source "$ZDOTDIR/env.zsh"
source "$ZDOTDIR/alias.zsh"
source "$ZDOTDIR/prompt.zsh"
source "$ZDOTDIR/functions.zsh"

ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
[ ! -d "$ZINIT_HOME" ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "$ZINIT_HOME/zinit.zsh"
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-completions
zinit light olets/zsh-abbr

setopt GLOB_DOTS
setopt AUTO_CD

zmodload zsh/complist
if command -v brew >/dev/null; then
  fpath=("$(brew --prefix)/share/zsh/site-functions" $fpath)
fi
[[ -d "$HOME/.nix-profile/share/zsh/site-functions" ]] && \
  fpath=("$HOME/.nix-profile/share/zsh/site-functions" $fpath)
autoload -Uz compinit && compinit

zinit light Aloxaf/fzf-tab
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-history-substring-search

bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down

LISTMAX=500
zstyle ':completion:*' menu no
zstyle ':completion:*' list-prompt '%SAt %p: Hit TAB for more%s'
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}' 'l:|=* r:|=*'
zstyle ':fzf-tab:*' fzf-flags --height=60% --layout=reverse
zstyle ':fzf-tab:complete:*' fzf-preview 'if [ -d ${(Q)realpath} ]; then ls -la ${(Q)realpath}; else less ${(Q)realpath} 2>/dev/null; fi'

source <(fzf --zsh)

command -v rbenv >/dev/null && eval "$(rbenv init - zsh)"
command -v nodenv >/dev/null && eval "$(nodenv init - zsh)"

[ -f "$ZDOTDIR/github_access_token.zsh" ] && source "$ZDOTDIR/github_access_token.zsh" || true
[ -f "$ZDOTDIR/work.zsh" ] && source "$ZDOTDIR/work.zsh" || true
[ -f "$ZDOTDIR/android_env.zsh" ] && source "$ZDOTDIR/android_env.zsh" || true
