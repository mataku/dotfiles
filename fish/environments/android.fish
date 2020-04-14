set -x JAVA_HOME (/usr/libexec/java_home -v 1.8)
set -x PATH $HOME/Library/Android/sdk/tools $PATH
set -x PATH $HOME/Library/Android/sdk/platform-tools $PATH
set -x PATH $HOME/Library/Android/sdk/tools/bin $PATH
set -x PATH $HOME/Library/Android/sdk/emulator $PATH
set -x PATH $HOME/Library/Android/sdk/cmdline-tools/latest/bin $PATH
set -x ANDROID_HOME $HOME/Library/Android/sdk
set -x PATH $HOME/Library/Android/sdk/build-tools/29.0.3 $PATH
alias bundletool 'java -jar ~/bundletool-all-0.13.3.jar'
alias clean './gradlew clean'
