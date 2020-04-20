set encoding=utf-8
scriptencoding utf-8

if &compatible
  set nocompatible
endif

set laststatus=2
" set showtabline=2
set noshowmode

" Setup dein

" dir where plugins are installed
let s:dein_dir = expand('~/.vim/dein')
let s:dein_repo_dir = s:dein_dir . '/repos/github.com/Shougo/dein.vim'

if &runtimepath !~# '/dein.vim'
  if !isdirectory(s:dein_repo_dir)
    execute '!git clone https://github.com/Shougo/dein.vim' s:dein_repo_dir
  endif
endif

set runtimepath^=~/.vim/dein/repos/github.com/Shougo/dein.vim
set runtimepath+=$GOROOT/misc/vim

" Plugin list (toml)
let s:toml      = '~/.vim/rc/dein.toml'
let s:lazy_toml = '~/.vim/rc/dein_lazy.toml'

"if dein#load_state([expand('<sfile>'), s:toml, s:lazy_toml])
if dein#load_state(s:dein_dir)
  
  call dein#begin(s:dein_dir)
  call dein#load_toml(s:toml,      {'lazy': 0})
  call dein#load_toml(s:lazy_toml, {'lazy': 1})
  call dein#end()
  call dein#save_state()
endif

if dein#check_install()
  call dein#install()
endif

" Setting options

let NERDTreeShowHidden = 1
autocmd vimenter * if !argc() | NERDTree | endif
autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif

set notitle
set mouse=a
set shell=zsh
set ambiwidth=double
set clipboard=unnamed,autoselect
set backspace=start,eol,indent
set number
set nowritebackup
set nobackup
set noswapfile
set ignorecase
set wrapscan
set wildmenu
set ruler

" Indent(default)
" Each language setting -> indent/XXX.vim

set tabstop=2
set softtabstop=2
set shiftwidth=2
set autoindent
set expandtab

filetype plugin indent on

" neocomplete

let g:neocomplete#enable_at_startup = 1
let g:neocomplete#enable_smart_case = 1

if expand("%:t") =~ ".*\.rb"
  let g:neocomplete#enable_at_startup = 1
  let g:neocomplete#enable_smart_case = 1
endif

if expand("%:t") =~ ".*\.py"
	" let g:jedi#popup_select_first = 0
	let g:jedi#completions_enabled = 1
	let g:jedi#auto_vim_configuration = 0
	let g:jedi#popup_on_dot = 1
  " au FileType python let b:did_ftplugin = 1
endif

if expand("%:t") =~ ".*\.java"
  "let g:neocomplete#enable_smart_case = 1
  let g:java_highlight_all = 1
  "let g:java_space_errors = 1
  let g:java_highlight_functions = 1
  setlocal omnifunc=javacomplete#Complete
endif

if expand("%:t") =~ ".*\.go"
  let g:go_highlight_functions = 1
  let g:go_highlight_methods = 1
  let g:go_highlight_structs = 1
endif

set completeopt=menu

if !exists('g:neocomplete#force_omni_input_patterns')
	let g:neocomplete#force_omni_input_patterns = {}
endif

let g:neocomplete#force_omni_input_patterns.ruby = '[^. *\t]\.\w*\|\h\w*::'
let g:neocomplete#force_omni_input_patterns.python = '[^. *\t]\.\w*\|\h\w*::'
let g:neocomplete#force_omni_input_patterns.go = '[^. *\t]\.\w*\|\h\w*::'
let g:neocomplete#force_omni_input_patterns.gitcommit = ':'
let g:neocomplete#force_omni_input_patterns.markdown = ':'


au BufRead,BufNewFile,BufReadPre *.coffee  set filetype=coffee
au BufRead,BufNewFile Fastfile set filetype=ruby
au BufRead,BufNewFile IAMFile set filetype=ruby
au BufWritePost *.coffee silent make!

au FileType java setl tabstop=2 expandtab shiftwidth=2 softtabstop=2 autoindent

au FileType ruby setlocal expandtab shiftwidth=2 tabstop=2 softtabstop=2 smartindent cinwords=if,elif,else,for,while,try,except,finally,def,class

au FileType go setlocal noexpandtab tabstop=4 shiftwidth=4 autoindent

au FileType gitcommit set omnifunc=emoji#complete
au FileType markdown set omnifunc=emoji#complete

au BufRead,BufNewFile .spacemacs set filetype=lisp

autocmd ColorScheme * highlight Normal ctermbg=none
autocmd ColorScheme * highlight LineNr ctermbg=none

syntax enable
set background=dark
colorscheme PaperColor
