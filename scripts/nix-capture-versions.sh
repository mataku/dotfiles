#!/bin/bash

set -euo pipefail

OUTPUT="${1:?usage: nix-capture-versions.sh <output.json>}"

nix eval --impure --system aarch64-darwin --json \
  '.#darwinConfigurations.macos.config' \
  --apply '
    cfg:
      let
        user = builtins.getEnv "USER";
        homePkgs = cfg.home-manager.users.${user}.home.packages or [];
        sysPkgs = cfg.environment.systemPackages or [];
      in
        map (p: { name = p.pname or p.name or "unknown"; version = p.version or ""; })
            (homePkgs ++ sysPkgs)
  ' > "$OUTPUT"
