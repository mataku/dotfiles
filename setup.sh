if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo 'Installing bundle'
/opt/homebrew/bin/brew bundle

echo 'Setup dotfiles'
./install.sh
