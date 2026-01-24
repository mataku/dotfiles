{
  description = "mataku's macOS system configuration with Nix";

  inputs = {
    # Use nixpkgs unstable for latest packages
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    # nix-darwin for macOS system configuration
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # home-manager for user environment and dotfiles
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, nix-darwin, home-manager, ... }:
    let username = builtins.getEnv "USER";
    in
    {
      # macOS configuration for Apple Silicon
      darwinConfigurations = {
        "macos" = nix-darwin.lib.darwinSystem {
          system = "aarch64-darwin";

          modules = [
            # Main nix-darwin configuration
            ./nix/darwin/configuration.nix

            # Integrate home-manager as a nix-darwin module
            home-manager.darwinModules.home-manager
            {
              # home-manager configuration
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.users.${username} = import ./nix/home/default.nix;

              # Pass inputs to home-manager modules
              home-manager.extraSpecialArgs = { inherit inputs; };
            }
          ];

          # Make inputs and username available to all modules
          specialArgs = { inherit inputs username; };
        };
      };
    };
}
