#!/bin/bash
INPUT=$(cat)
PROJECT=$(echo "$INPUT" | jq -r '.cwd' | xargs basename)
MESSAGE=$(echo "$INPUT" | jq -r '.message // "Claude is waiting for your input"')

terminal-notifier \
  -title "Claude Code - ${PROJECT}" \
  -message "$MESSAGE" \
  -activate com.github.wez.wezterm \
  -sender com.github.wez.wezterm
