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

osascript - "Claude Code" "$MSG" <<'EOF'
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
EOF
