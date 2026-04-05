gcd() {
  cd "$(ghq list -p | fzf)"
}

gco() {
  local branch
  branch=$(git branch -a | fzf | tr -d ' ')
  [[ -z "$branch" ]] && return
  branch=${branch#remotes/origin/}
  branch=${branch#\*}
  git checkout "$branch"
}

_fzf_select_history() {
  local selected
  selected=$(history | fzf | sed 's/^[ ]*[0-9]*[ ]*//')
  if [[ -n "$selected" ]]; then
    BUFFER="$selected"
    CURSOR=${#BUFFER}
  fi
  zle redisplay
}
zle -N _fzf_select_history
bindkey '^r' _fzf_select_history

_ghq_repository_search() {
  local repo
  repo=$(ghq list -p | fzf)
  [[ -n "$repo" ]] && cd "$repo"
  zle redisplay
}
zle -N _ghq_repository_search
bindkey '^g' _ghq_repository_search

gpr() {
  local branch
  branch=$(git branch -a | fzf | tr -d ' ')
  [[ -z "$branch" ]] && return
  branch=${branch#remotes/origin/}
  hub mkpr "$branch"
}

gmg() {
  local branch
  branch=$(git branch -a | fzf | tr -d ' ')
  [[ -z "$branch" ]] && return
  branch=${branch#remotes/origin/}
  git merge -S "$branch"
}

gnew() {
  if [[ -z "$1" ]]; then
    echo 'Specify branch name!'
    return 1
  fi
  git switch -c "feature/$1"
}

killer() {
  ps aux -o pid,command | fzf -e | awk '{print $2}' | xargs kill
}

adb-install() {
  local apk device
  apk=$(fd -e apk --full-path -I app/ | fzf)
  if [[ -z "$apk" ]]; then
    echo "Can't find apk!"
    return 1
  fi

  device=$(adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf)
  if [[ -z "$device" ]]; then
    echo 'Specify device!'
    return 1
  fi
  adb -s "$device" install -d -r "$apk"
}

adb-uninstall() {
  local device
  device=$(adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf)
  if [[ -z "$device" ]]; then
    echo 'Specify device!'
    return 1
  fi
  adb -s "$device" shell pm list package | sed -e s/package:// | fzf | xargs adb -s "$device" uninstall
}

adb-open() {
  if [[ -z "$1" ]]; then
    echo 'Specify scheme!'
    return 1
  fi
  adb shell am start -a android.intent.action.VIEW -d "$1"
}

adb-open-app() {
  local package activity
  if [[ -n "$1" ]]; then
    activity=$(adb shell pm dump "$1" | grep -A 2 android.intent.action.MAIN | head -2 | tail -1 | awk '{print $2}')
    adb shell am start -n "$activity"
    return 0
  fi

  package=$(adb shell pm list package | sed -e s/package:// | fzf)
  if [[ -z "$package" ]]; then
    echo 'Specify app!'
    return 1
  fi
  activity=$(adb shell pm dump "$package" | grep -A 2 android.intent.action.MAIN | head -2 | tail -1 | awk '{print $2}')
  adb shell am start -n "$activity"
}

adb-screenshot() {
  local device filename
  device=$(adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf)
  if [[ -z "$device" ]]; then
    echo 'Specify device!'
    return 1
  fi
  filename=${1:-screenshot}
  adb -s "$device" shell screencap -p "/sdcard/${filename}.png" \
    && adb -s "$device" pull "/sdcard/${filename}.png" \
    && adb -s "$device" shell rm "/sdcard/${filename}.png"
}

adb-screenrecord() {
  local device
  device=$(adb devices | awk 'NR>1 && $0 != ""' | awk '{print $1}' | fzf)
  if [[ -z "$device" ]]; then
    echo 'Specify device!'
    return 1
  fi
  adb -s "$device" shell screenrecord /sdcard/record.mp4
  sleep 2
  adb -s "$device" pull /sdcard/record.mp4
}

emu() {
  local option=""
  if [[ "$1" == "--coldboot" ]]; then
    option="-no-snapshot-load"
  fi
  avdmanager list avd | grep 'Name:' | awk -F ':' '{print $2}' | fzf | xargs -I{} emulator @{} $option
}
