function gmg
  git branch -a | fzf | tr -d ' ' | read branch
  if [ $branch ]
    git merge -S $branch
  end
  commandline -f repaint
end
