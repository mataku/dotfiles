function adb-uninstall
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    adb -s $device shell pm list package | sed -e s/package:// | fzf | xargs adb -s $device uninstall
  else
    echo 'Specify device!'
    return 1
  end
end

