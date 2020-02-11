function adb-uninstall
  adb shell pm list package | sed -e s/package:// | fzf | xargs adb uninstall
end

