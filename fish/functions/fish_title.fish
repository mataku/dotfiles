function fish_title
  prompt_pwd
  set -l branch (git branch 2> /dev/null | grep -e '\* ' | sed 's/^..\(.*\)/\1/')
  if [ $branch ]
    echo -ne "     🌱   branch: " $branch
  end
end
