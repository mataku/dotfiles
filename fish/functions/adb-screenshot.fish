function adb-screenshot -d 'Capture screenshot. Usage: adb-screenshot filename'
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    if [ $argv[1] ]
      set ADB_SCREENSHOT_FILENAME $argv[1]
    else
      set ADB_SCREENSHOT_FILENAME screenshot
    end

    adb shell screencap -p /sdcard/$ADB_SCREENSHOT_FILENAME.png && adb pull /sdcard/$ADB_SCREENSHOT_FILENAME.png && adb shell rm /sdcard/$ADB_SCREENSHOT_FILENAME.png
  else
    echo 'Specify device!'
    return 1
  end
end
