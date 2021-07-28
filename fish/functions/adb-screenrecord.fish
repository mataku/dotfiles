function adb-screenrecord -d 'Record screen as record.mp4 and pull it from device.'
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    function pull-video --on-job-exit %self
      sleep 2
      adb pull /sdcard/record.mp4
      functions -e pull-video
    end

    adb -s $device shell screenrecord /sdcard/record.mp4
  else
    echo 'Specify device!'
    return 1
  end
end
