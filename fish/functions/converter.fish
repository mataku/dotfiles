function converter
  if [ $argv[1] ]
    magick $argv[1] -resize 540x $argv[1]
  else
    echo 'Specify image file'
    return 1
  end
end
