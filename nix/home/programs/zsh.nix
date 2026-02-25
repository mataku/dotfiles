{ config, pkgs, lib, ... }:

{
  # Zsh is installed via home.packages (see packages.nix)
  # Configuration files are symlinked from zsh/ directory (see default.nix)
  # Plugins are managed via zinit in .zshrc
  # No programs.zsh configuration needed - fully manual management
}
