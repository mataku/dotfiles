set fish_function_path $fish_function_path "/usr/local/lib/python3.6/site-packages/powerline/bindings/fish"
powerline-setup
powerline-daemon -q

set current_branch (command git rev-parse --abbrev-ref HEAD ^/dev/null)

. ~/.config/fish/aliases.fish
. ~/.config/fish/env.fish

# peco history (Ctrl + r)
function fish_user_key_bindings
  bind \cr peco_select_history
end
