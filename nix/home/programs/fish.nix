{ config, pkgs, lib, ... }:

{
  # Fish shell installed via Nix, but configuration managed manually
  # The existing ~/.config/fish/config.fish and plugins are used as-is
  programs.fish = {
    enable = true;
    # No shellAliases, shellAbbrs, interactiveShellInit, or plugins
    # Use existing config.fish and fisher/other plugin managers
  };
}
