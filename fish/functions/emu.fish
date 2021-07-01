function emu
  if [ $argv[1] ] 
    if test $argv[1] = '--coldboot'
      set option '-no-snapshot-load'
    end
  end

  avdmanager list avd | grep 'Name:' | awk -F ':' '{print $2}' | fzf | xargs -I{} emulator @{} $option
  set -e option
end

