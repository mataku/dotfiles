set current_branch (command git rev-parse --abbrev-ref HEAD ^/dev/null)

. ~/.config/fish/alias.fish
. ~/.config/fish/env.fish

rbenv init - | .
pyenv init - | .

if test -e ~/.config/fish/github_access_token.fish
  . ~/.config/fish/github_access_token.fish
end

if test -e ~/.config/fish/work.fish
  . ~/.config/fish/work.fish
end

if test -e ~/.config/fish/android_env.fish
  . ~/.config/fish/android_env.fish
end

# peco history (Ctrl + r)
function fish_user_key_bindings
  bind \cr peco_select_history
end

# if not [ $TMUX ]
  # tmux
# end

set -x LANG ja_JP.UTF-8
