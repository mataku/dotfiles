function adb-install
  fd -e apk --full-path -I app/ | fzf | read apk
  if not [ $apk ]
    echo 'Can\'t find apk!'
    return 1
  end

  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    adb -s $device install -d -r $apk
  else
    echo 'Specify device!'
    return 1
  end
end

