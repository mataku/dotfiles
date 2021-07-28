function adb-screenrecord
  function pull-video --on-job-exit %self
    sleep 2
    adb pull /sdcard/record.mp4
    functions -e pull-video
  end

  adb shell screenrecord /sdcard/record.mp4
end
