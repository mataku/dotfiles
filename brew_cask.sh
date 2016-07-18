brew update && brew upgrade && brew cleanup
for c in `brew cask list`; 
do ! brew cask info $c | grep -qF "Not installed" || brew cask install $c --force;
done
for c in /usr/local/Caskroom/*;
do vl=(`ls -t $c`) && for v in "${vl[@]:1}";
do rm -rf "$c/$v";
done;
done
brew cask cleanup
