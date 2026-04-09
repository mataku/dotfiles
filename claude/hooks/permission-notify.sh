#!/bin/bash
INPUT=$(cat)
PROJECT=$(echo "$INPUT" | jq -r '.cwd' | xargs basename)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
DETAIL=$(echo "$INPUT" | jq -r '
  if .tool_input.command then .tool_input.command
  elif .tool_input.file_path then .tool_input.file_path
  else empty
  end' | head -c 100)

MSG="${PROJECT}: ${TOOL} awaiting permission"
if [ -n "$DETAIL" ]; then
  MSG="${MSG} - ${DETAIL}"
fi

terminal-notifier \
  -title "Claude Code" \
  -message "$MSG" \
  -activate com.github.wez.wezterm \
  -sender com.github.wez.wezterm
