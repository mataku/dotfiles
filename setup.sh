if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo 'Installing bundle'
/opt/homebrew/bin/brew bundle

echo 'Setup dotfiles'
mkdir -p ~/.config/nvim/lua/config
mkdir -p ~/.config/wezterm
mkdir -p ~/Library/Application\ Support/lazygit
./link_files.sh

/opt/homebrew/bin/rustup default stable
/opt/homebrew/bin/rustup component add rust-analyzer
curl -fsSL https://claude.ai/install.sh | bash
