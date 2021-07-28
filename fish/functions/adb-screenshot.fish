function adb-screenshot
  if [ $argv[1] ]
    set ADB_SCREENSHOT_FILENAME $argv[1]
  else
    set ADB_SCREENSHOT_FILENAME screenshot
  end

  adb shell screencap -p /sdcard/$ADB_SCREENSHOT_FILENAME.png && adb pull /sdcard/$ADB_SCREENSHOT_FILENAME.png && adb shell rm /sdcard/$ADB_SCREENSHOT_FILENAME.png
end

