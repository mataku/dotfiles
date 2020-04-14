function emu
  avdmanager list avd | grep 'Name:' | awk -F ':' '{print $2}' | fzf | xargs -I{} emulator @{}
end

