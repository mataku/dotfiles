alias g git
alias t tig
alias v vim

if string match -q 'Darwin' (uname)
  alias grep ggrep
  alias sed gsed
end

alias ls 'lsd -a'
alias bx 'bundle exec'
alias dx 'docker exec'
alias e 'emacsclient -nw'
alias dl 'docker ps -l -q'
alias sudo 'sudo '
alias bi 'bundle install -j4'
alias gpush 'git push -u origin (git rev-parse --abbrev-ref HEAD ^/dev/null)'
# alias gpull 'git pull origin (git rev-parse --abbrev-ref HEAD ^/dev/null)'
alias gpull 'git pull'
alias gst 'git st'
alias gdif 'git diff'
alias gcm 'git cm'
alias gwip 'git wip'
alias gl 'git log'
alias K 'kubectl'
abbr ga 'g add'
