#!/bin/zsh
tmux showenv -g TMUX_PWD_$(tmux display -p "#D" | tr -d %) | sed 's/^.*=//' | sed -e 's/\/Users\/rhythnn/~/'
