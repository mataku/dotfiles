function killer -d 'Process killer'
  ps aux -o pid,command | peco --query "$LBUFFER" | awk '{print $2}' | xargs kill
end
