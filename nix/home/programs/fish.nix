{ config, pkgs, lib, ... }:

{
  # Fish shell is installed via home.packages (see packages.nix)
  # Configuration files are symlinked from fish/ directory (see default.nix)
  # Plugins are managed via fisher/other plugin managers in config.fish
  # No programs.fish configuration needed - fully manual management
}
