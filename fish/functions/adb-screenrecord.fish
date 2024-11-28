function adb-screenrecord -d 'Record screen as record.mp4 and pull it from device.'
  adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf | read device
  if [ $device ]
    set -Ux DEVICE $device
    function pull-video --on-job-exit %self
      sleep 2
      adb -s $DEVICE pull /sdcard/record.mp4
      set -e DEVICE
      functions -e pull-video
    end

    adb -s $DEVICE shell screenrecord /sdcard/record.mp4
  else
    echo 'Specify device!'
    return 1
  end
end
