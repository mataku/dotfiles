function _tmuxpopup
  set -l initial_cmd $argv[1]
  set -l title $argv[2]

  set -l width '80%'
  set -l height '80%'

  set -l session (tmux display-message -p -F '#{session_name}' 2>/dev/null); or return 1
  set -l pane_path (tmux display-message -p -F '#{pane_current_path}'); or return 1

  set -l home_src "$HOME/src"
  set -l key ""

  if string match -q "$home_src/*/*/*" "$pane_path"
    set -l rest (string replace "$home_src/" "" "$pane_path")
    set -l parts (string split "/" $rest)
    set -l org $parts[2]
    set -l repo $parts[3]
    set repo (string replace -r -- '-wt$' '' $repo)
    set key "$org/$repo"
  else
    set key (basename $pane_path)
  end

  set -l safe_key (string replace -a '/' '_' $key)
  set safe_key (string replace -ra '[^A-Za-z0-9_.\-]' '_' $safe_key)

  set -l popup_session "popup_{$title}_{$safe_key}"

  if string match -q 'popup_*' $session
    tmux detach-client
    return 0
  end

  set -l create_cmd
  if test -n "$initial_cmd"
    set create_cmd "tmux new-session -d -s $popup_session '$initial_cmd'"
  else
    set create_cmd "tmux new-session -d -s $popup_session"
  end

  set -l exec_cmd "tmux has-session -t $popup_session 2>/dev/null || { $create_cmd && tmux set-option -t $popup_session status off; }; tmux attach -t $popup_session"

  tmux display-popup \
    -d "#{pane_current_path}" \
    -xC -yC \
    -w "$width" -h "$height" \
    -T "$title" \
    -E "$exec_cmd"
end
