#!/bin/sh
sudo tlmgr update --self --all
cd /usr/local/texlive/2015basic/texmf-dist/scripts/cjk-gs/integrate
sudo perl cjk-gs-integrate.pl --link-texmf --force
sudo mktexlsr
sudo updmap-sys --setoption kanjiEmbed hiragino-elcapitan
