function buildapk
  fd '.aab'  app/build/outputs/ installed/ | fzf | read aab
  if [ $aab ]
    bundletool build-apks --bundle=$aab \
               --output=app.apks \
               --overwrite \
               --connected-device

    bundletool install-apks --apks=app.apks
    set -e aab
  else
    echo 'Specify aab!'
  end
end

