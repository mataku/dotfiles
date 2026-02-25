gcd() {
  cd "$(ghq list -p | fzf)"
}

gco() {
  local branch
  branch=$(git branch -a | fzf | tr -d ' ')
  [[ -z "$branch" ]] && return
  branch=${branch#remotes/origin/}
  branch=${branch#\*}
  git checkout "$branch"
}

_fzf_select_history() {
  local selected
  selected=$(history | fzf | sed 's/^[ ]*[0-9]*[ ]*//')
  if [[ -n "$selected" ]]; then
    BUFFER="$selected"
    CURSOR=${#BUFFER}
  fi
  zle redisplay
}
zle -N _fzf_select_history
bindkey '^r' _fzf_select_history

_ghq_repository_search() {
  local repo
  repo=$(ghq list -p | fzf)
  [[ -n "$repo" ]] && cd "$repo"
  zle redisplay
}
zle -N _ghq_repository_search
bindkey '^g' _ghq_repository_search
