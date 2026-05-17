{
  description = "mataku's macOS system configuration with Nix";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

    # Unstable: only for packages not yet in stable
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    nix-darwin = {
      url = "github:nix-darwin/nix-darwin/nix-darwin-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, nixpkgs-unstable, nix-darwin, home-manager, ... }:
    let
      username = builtins.getEnv "USER";
      system = "aarch64-darwin";
      pkgs-unstable = import nixpkgs-unstable {
        inherit system;
        config.allowUnfree = true;
      };
    in
    {
      # macOS configuration for Apple Silicon
      darwinConfigurations = {
        "macos" = nix-darwin.lib.darwinSystem {
          inherit system;

          modules = [
            ./nix/darwin/configuration.nix

            # Integrate home-manager as a nix-darwin module
            home-manager.darwinModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = false;
              home-manager.users.${username} = import ./nix/home/default.nix;

              # Pass inputs and unstable pkgs to home-manager modules
              home-manager.extraSpecialArgs = { inherit inputs pkgs-unstable; };
            }
          ];

          # Make inputs and username available to all modules
          specialArgs = { inherit inputs username; };
        };
      };
    };
}
