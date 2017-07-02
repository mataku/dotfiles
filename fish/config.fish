set fish_function_path $fish_function_path "/usr/local/lib/python3.6/site-packages/powerline/bindings/fish"
powerline-setup
powerline-daemon -q

set current_branch (command git rev-parse --abbrev-ref HEAD ^/dev/null)

. ~/.config/fish/alias.fish
. ~/.config/fish/env.fish

rbenv init - | .

if test -e ~/.config/fish/github_access_token.fish
  . ~/.config/fish/github_access_token.fish
end

if test -e ~/.config/fish/work.fish
  . ~/.config/fish/work.fish
end

# peco history (Ctrl + r)
function fish_user_key_bindings
  bind \cr peco_select_history
end

if not [ $TMUX ]
  tmux
end
