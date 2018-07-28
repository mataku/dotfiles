function gco
  git branch -a | peco | tr -d ' ' | read branch
  if [ $branch ]
    if string match "remotes/*" $branch
      set -l b (string replace 'remotes/origin/' '' $branch)
      git checkout $b
    else
      git checkout $branch
    end
  end
  commandline -f repaint
end

