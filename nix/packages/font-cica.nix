{ pkgs, stdenvNoCC, fetchzip }:

stdenvNoCC.mkDerivation rec {
  pname = "font-cica";
  version = "5.0.3";

  src = fetchzip {
    url = "https://github.com/miiton/Cica/releases/download/v${version}/Cica_v${version}.zip";
    sha256 = "sha256-BtDnfWCfD9NE8tcWSmk8ciiInsspNPTPmAdGzpg62SM=";
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
