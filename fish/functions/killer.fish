function killer
  ps a -o pid,command | peco --query "$LBUFFER" | awk '{print $1}' | xargs kill
end

