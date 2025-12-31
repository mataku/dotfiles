{ pkgs, stdenvNoCC, fetchzip }:

stdenvNoCC.mkDerivation rec {
  pname = "font-cica";
  version = "5.0.3";

  src = fetchzip {
    url = "https://github.com/miiton/Cica/releases/download/v${version}/Cica_v${version}.zip";
    # Hash will be determined on first build
    # Run: nix-prefetch-url --unpack https://github.com/miiton/Cica/releases/download/v5.0.3/Cica_v5.0.3.zip
    sha256 = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; # Placeholder
    stripRoot = false;
  };

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/fonts/truetype
    cp *.ttf $out/share/fonts/truetype/ || true

    runHook postInstall
  '';

  meta = with pkgs.lib; {
    description = "Cica - Programming font for Japanese";
    homepage = "https://github.com/miiton/Cica";
    license = licenses.ofl;
    platforms = platforms.all;
  };
}
