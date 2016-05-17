let plugins = dein#load_cache_raw(['/Users/rhythnn/.vimrc'], 1)
if empty(plugins) | throw 'Cache loading error' | endif
let g:dein#_plugins = plugins
let g:dein#_base_path = '/Users/rhythnn/.vim/dein'
let g:dein#_runtime_path = '/Users/rhythnn/.vim/dein/.dein'
let &runtimepath = '/Users/rhythnn/.vim/dein/repos/github.com/Shougo/dein.vim,/Users/rhythnn/.vim,/Users/rhythnn/.vim/dein/.dein,/usr/local/share/vim/vimfiles,/usr/local/share/vim/vim74,/usr/local/share/vim/vimfiles/after,/Users/rhythnn/.vim/after,/usr/local/Cellar/go/1.6.2/libexec/misc/vim,/Users/rhythnn/.vim/dein/.dein/after'
