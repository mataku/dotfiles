function buildapk
  fd '.aab'  app/build/outputs/ | fzf | read aab
  if [ $aab ]
    bundletool build-apks --bundle=$aab \
               --output=app.apks \
               --ks=~/.android/debug.keystore \
               --ks-pass=pass:android \
               --ks-key-alias=androiddebugkey \
               --key-pass=pass:android \
               --overwrite \
               --connected-device

    bundletool install-apks --apks=app.apks
    set -e aab
  else
    echo 'Specify aab!'
  end
end

