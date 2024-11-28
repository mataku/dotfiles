function adb-open-app
  set -l package (adb shell pm list package | sed -e s/package:// | fzf)
  if [ $package ]
    set -l activity (adb shell pm dump $package | grep -A 2 android.intent.action.MAIN | head -2 | tail -1 | awk '{print $2}')
    adb shell am start -n $activity
  else
    echo 'Specify app!'
    return 1
  end
end
