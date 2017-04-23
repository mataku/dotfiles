function set_alias
  alias grep="ggrep"
  alias be="bundle exec"
  alias de="docker exec"
  alias v='vim'
  alias dl='docker ps -l -q'
  alias pip3_upgrade="pip3 list --outdated | awk '{print \$1}' | xargs pip3 install -U"
  alias ls="ls -G"
  alias sudo='sudo '
  alias sed="gsed"
  alias bi="bundle install -j4"
  alias g="git"
end

