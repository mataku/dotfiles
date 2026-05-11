#!/bin/bash
INPUT=$(cat)
PROJECT=$(echo "$INPUT" | jq -r '.cwd' | xargs basename)
MESSAGE=$(echo "$INPUT" | jq -r '.message // "Claude is waiting for your input"')

osascript - "Claude Code - ${PROJECT}" "$MESSAGE" <<'EOF'
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
EOF
