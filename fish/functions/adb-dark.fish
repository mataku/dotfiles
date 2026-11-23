function adb-dark -d 'Change to Dark mode'
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    adb -s $device shell "cmd uimode night yes"
  else
    echo 'Specify device!'
    return 1
  end
end

