function gnew
  if [ $argv[1] ]
    git checkout -b feature/$argv[1]
  else
    echo 'Specify branch name!'
    return 1
  end
end

