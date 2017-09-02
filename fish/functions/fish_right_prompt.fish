function fish_right_prompt
  if not [ $TMUX ]
    set -l branch (git branch 2> /dev/null | grep -e '\* ' | sed 's/^..\(.*\)/\1/')
    set -l prefix "\ue0a0"
    echo -ne \ue0a0 $branch
  end
end
