function gco
  git branch -a | peco | tr -d ' ' | read branch
  if [ $branch ]
    if contains $branch "remotes/"
      set -l b (echo $branch | awk -F'/' '{print $3}')
      git checkout -b $b $branch
    else
      git checkout $branch
    end
  end
  commandline -f repaint
end

