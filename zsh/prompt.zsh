autoload -U colors && colors

_git_branch_name() {
  git symbolic-ref HEAD 2>/dev/null | sed 's|^refs/heads/||'
}

_is_git_dirty() {
  git status -s --ignore-submodules=dirty 2>/dev/null
}

_set_prompt() {
  local last_status=$?
  local git_info=""
  local branch
  branch=$(_git_branch_name)

  if [[ -n "$branch" ]]; then
    local dirty=""
    [[ -n "$(_is_git_dirty)" ]] && dirty="%{$fg[yellow]%}*"
    git_info="%{$fg[magenta]%}(${branch}${dirty}%{$fg[magenta]%})%{$reset_color%} "
  fi

  local arrow
  if [[ $last_status -eq 0 ]]; then
    arrow="%{$fg[green]%}⫸%{$reset_color%}  "
  else
    arrow="%{$fg[red]%}⫸%{$reset_color%}  "
  fi

  PROMPT="${git_info}${arrow}"
}

precmd_functions+=(_set_prompt)
