set current_branch (command git rev-parse --abbrev-ref HEAD ^/dev/null)

. ~/.config/fish/alias.fish
. ~/.config/fish/env.fish

rbenv init - | .
pyenv init - | .
nodenv init - | .
direnv hook fish | .

if test -e ~/.config/fish/github_access_token.fish
  . ~/.config/fish/github_access_token.fish
end

if test -e ~/.config/fish/work.fish
  . ~/.config/fish/work.fish
end

if test -e ~/.config/fish/android_env.fish
  . ~/.config/fish/android_env.fish
end

function fzf_select_history
  history | fzf | read selection
  if [ $selection ]
    commandline $selection
  else
    commandline ''
  end
end

# peco history (Ctrl + r)
function fish_user_key_bindings
  bind \cr fzf_select_history
end

if not ps aux | grep -q \[e\]macs
  emacs --daemon
end

# if not [ $TMUX ]
  # tmux
# end
