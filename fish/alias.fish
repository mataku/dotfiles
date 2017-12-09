alias a atom
alias g git
alias v vim
alias grep ggrep
alias sed gsed
alias ls exa

alias be 'bundle exec'
alias de 'docker exec'
alias e 'emacsclient -nw'
alias dl 'docker ps -l -q'
alias pip3_upgrade 'pip3 list --outdated | awk "{print \$1}" | xargs pip3 install -U'
alias sudo 'sudo '
alias bi 'bundle install -j4 --path vendor/bundle'
alias gpush 'git push origin (git rev-parse --abbrev-ref HEAD ^/dev/null)'
# alias gpull 'git pull origin (git rev-parse --abbrev-ref HEAD ^/dev/null)'
alias gpull 'git pull'
alias gst 'git st'
alias gdif 'git diff'
alias gcm 'git cm'
alias gwip 'git wip'
alias gl 'git log'
alias gh 'cd (ghq list -p | peco)'
alias gl 'git log'
alias clean './gradlew clean'
abbr ga 'g add'
