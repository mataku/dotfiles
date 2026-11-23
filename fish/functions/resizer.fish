function resizer
  if [ $argv[1] ]
    magick $argv[1] -resize 360x $argv[1]
  else
    echo 'Specify image filename!'
    return 1
  end
end

