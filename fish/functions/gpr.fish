function gpr
  git branch -a | fzf | tr -d ' ' | read branch
  if [ $branch ]
    if string match "remotes/*" $branch
      set -l b (string replace 'remotes/origin/' '' $branch)
      hub mkpr $b
    else
      hub mkpr $branch
    end
  end
  commandline -f repaint
end
