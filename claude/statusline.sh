#!/bin/bash

# Why this is not a Claude Code mod (function hooks), as of Claude Code 2.1.288:
# - $.ui.status() draws the line with a "⚠ <plugin>:" prefix in the warning color, and it takes plain text only, so no colors or styling.
# - The AbovePrompt band can be styled, but it sits above the prompt input instead of below it.
# - PromptHint's tail is dim text after the hint line, and only the terminal draws it, not the desktop app.

# Read the JSON payload from stdin
input=$(cat)

# Extract the fields in a single jq call
IFS=$'\x1f' read -r model context_used cwd five_hour_used five_hour_resets seven_day_used seven_day_resets < <(
  echo "$input" | jq -r '[
    .model.display_name // "Claude",
    .context_window.used_percentage // 0,
    .workspace.current_dir // .cwd,
    .rate_limits.five_hour.used_percentage,
    .rate_limits.five_hour.resets_at,
    .rate_limits.seven_day.used_percentage,
    .rate_limits.seven_day.resets_at
  ] | map(. // "" | tostring) | join("\u001f")'
)

now=$(date +%s)
reset=$'\033[0m'
dim=$'\033[2m'
gray=$'\033[38;5;248m'
green=$'\033[32m'
yellow=$'\033[33m'
red=$'\033[31m'

# Current git branch (empty if unavailable)
branch=""
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
fi

# Branch segment (only when a branch is found)
branch_segment=""
if [ -n "$branch" ]; then
  branch_segment=" | 🌿 ${branch}"
fi

format_duration() {
  local minutes=$(( ($1 + 59) / 60 ))
  local days=$(( minutes / 1440 ))
  local hours=$(( minutes % 1440 / 60 ))
  if [ "$days" -gt 0 ]; then
    echo "${days}d${hours}h"
  elif [ "$hours" -gt 0 ]; then
    echo "${hours}h$(( minutes % 60 ))m"
  else
    echo "$(( minutes % 60 ))m"
  fi
}

threshold_color() {
  local used=$1
  if [ "$used" -ge 80 ]; then
    echo "$red"
  elif [ "$used" -ge 50 ]; then
    echo "$yellow"
  else
    echo "$green"
  fi
}

pace_color() {
  local used=$1 elapsed=$2
  local margin=$(( elapsed - used ))
  if [ "$used" -ge 90 ] || [ "$margin" -lt -15 ]; then
    echo "$red"
  elif [ "$margin" -lt 10 ] && [ "$used" -ge 10 ]; then
    echo "$yellow"
  else
    echo "$green"
  fi
}

render_meter() {
  local label=$1 used=$2 color=$3 suffix=$4
  local filled=$(( (used * 10 + 50) / 100 ))
  local bar_filled="" bar_empty="" i
  for (( i = 0; i < 10; i++ )); do
    if [ "$i" -lt "$filled" ]; then
      bar_filled+="█"
    else
      bar_empty+="░"
    fi
  done
  printf ' | %s %s%s%s%s%s%s %s%s%%%s%s' \
    "$label" "$gray" "$bar_filled" "$reset" "$dim" "$bar_empty" "$reset" "$color" "$used" "$reset" "$suffix"
}

context_meter() {
  local used
  used=$(printf '%.0f' "$1")
  render_meter Context "$used" "$(threshold_color "$used")" ""
}

rate_limit_meter() {
  local label=$1 used_raw=$2 resets_at=$3 window=$4 show_clock=$5
  [ -z "$used_raw" ] && return

  local used elapsed=0 suffix=""
  used=$(printf '%.0f' "$used_raw")
  if [ -n "$resets_at" ]; then
    local remaining=$(( resets_at - now ))
    if [ "$remaining" -le 0 ]; then
      used=0
    else
      elapsed=$(( 100 - remaining * 100 / window ))
      [ "$elapsed" -lt 0 ] && elapsed=0
      suffix=" $(format_duration "$remaining")"
      [ "$show_clock" = 1 ] && suffix+=" ($(date -r "$resets_at" +%H:%M))"
    fi
  fi

  render_meter "$label" "$used" "$(pace_color "$used" "$elapsed")" "$suffix"
}

# Print the status line
echo "${model}${branch_segment}$(context_meter "$context_used")$(rate_limit_meter 5h "$five_hour_used" "$five_hour_resets" 18000 1)$(rate_limit_meter 7d "$seven_day_used" "$seven_day_resets" 604800 0)"
