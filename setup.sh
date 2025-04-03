if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo 'Installing bundle'
/opt/homebrew/bin/brew bundle

echo 'Setup dotfiles'
mkdir -p $HOME/.config/nvim/lua/config
mkdir -p $HOME/.config/wezterm
./link_files.sh

/opt/homebrew/bin/rustup default stable
/opt/homebrew/bin/rustup component add rust-analyzer
