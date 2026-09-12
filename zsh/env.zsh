export HOMEBREW_CASK_OPTS="--appdir=/Applications"
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.nodenv/shims:$PATH"

if [[ "$(uname -m)" == 'arm64' ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

export PATH="$HOME/Library/Android/sdk/tools:$PATH"
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/fvm/default/bin:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
export GOPATH="$HOME/go"
export EDITOR="nvim"
export HOMEBREW_NO_AUTO_UPDATE=1
export LANG="ja_JP.UTF-8"

export RIPGREP_CONFIG_PATH="$HOME/src/github.com/mataku/dotfiles/ripgrep/ripgreprc"

export FZF_DEFAULT_OPTS='--cycle --ansi --select-1 --exit-0'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'

source "$ZDOTDIR/environments/android.zsh"

if [[ -f "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc" ]]; then
  source "/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc"
fi
