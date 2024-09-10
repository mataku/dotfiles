function adb-open
  if [ $argv[1] ]
    adb shell am start -a android.intent.action.VIEW -d $argv[1]
  else
    echo 'Specify scheme!'
    return 1
  end
end
