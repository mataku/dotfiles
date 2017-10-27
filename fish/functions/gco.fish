function gco
  git branch -a | peco | tr -d ' ' | read branch
  if [ $branch ]
    if string match "remotes/*" $branch
      set -l b (echo $branch | awk -F '/' '{print $3 "/" $4}')
      git checkout $b
    else
      git checkout $branch
    end
  end
  commandline -f repaint
end

