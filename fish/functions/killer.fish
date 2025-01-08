function killer -d 'Process killer'
  ps aux -o pid,command | fzf -e --query "$LBUFFER" | awk '{print $2}' | xargs kill
end
