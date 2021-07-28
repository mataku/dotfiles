function gco -d 'Switch branch'
  git branch -a | fzf | tr -d ' ' | read branch
  if [ $branch ]
    if string match -q "remotes/*" $branch
      set -l b (string replace 'remotes/origin/' '' $branch)
      set -l b (string replace '*' '' $b)
      git checkout $b
    else
      set -l b (string replace '*' '' $branch)
      git checkout $b
    end
  end
  commandline -f repaint
end
