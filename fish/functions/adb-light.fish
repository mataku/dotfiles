function adb-light -d 'Change to LIght mode'
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    adb -s $device shell "cmd uimode night no"
  else
    echo 'Specify device!'
    return 1
  end
end

