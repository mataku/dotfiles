set encoding=utf-8
scriptencoding utf-8


if &compatible
  set nocompatible
endif

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




" call dein#add('Shougo/dein.vim')
"call dein#add('Shougo/vimproc.vim', {
"  \ 'build' : {
"  \   'mac' : 'make -f make_mac.mak',
"  \   'unix': 'gmake',
"  \   },
"  \ })


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
"set showcmd
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


" neocomplete setting

let g:neocomplete#enable_smart_case = 1

if expand("%:t") =~ ",*\.rb"
  let g:neocomplete#enable_at_startup = 1
  let g:neocomplete#enable_smart_case = 1
endif

if expand("%:t") =~ ".*\.go"
  let g:neocomplete#enable_at_startup = 1
  let g:go_highlight_functions = 1
  let g:go_highlight_methods = 1
  let g:go_highlight_structs = 1
  let g:go_highlight_operators = 1
  set completeopt=menu
  au BufRead,BufNewFile,BufReadPre *.go  set filetype=go

endif

if expand("%:t") =~ ".*\.py"
	let g:neocomplete#enable_at_startup = 1
	" let g:jedi#popup_select_first = 0
	let g:jedi#completions_enabled = 0
	let g:jedi#auto_vim_configuration = 0
	let g:jedi#popup_on_dot = 1
	" au FileType python let b:did_ftplugin = 1
  " let g:syntastic_python_checkers = ["flake8"]
  " let g:flake8_bulitins="_,apply"
  " let g:flake8_cmd="/usr/local/bin/flake8"
  " 
  " au BufWritePost *.py call Flake8()


endif

if expand("%:t") =~ ",*\.java"
  let g:neocomplete#enable_at_startup = 1
  "let g:neocomplete#enable_smart_case = 1
  let g:java_highlight_all = 1
  "let g:java_space_errors = 1
  let g:java_highlight_functions = 1
  setlocal omnifunc=javacomplete#Complete
endif

set completeopt=menu


if !exists('g:neocomplete#force_omni_input_patterns')
	let g:neocomplete#force_omni_input_patterns = {}
endif

let g:neocomplete#force_omni_input_patterns.ruby = '[^. *\t]\.\w*\|\h\w*::'
let g:neocomplete#force_omni_input_patterns.python = '[^. *\t]\.\w*\|\h\w*::'
let g:neocomplete#force_omni_input_patterns.go = '[^. *\t]\.\w*\|\h\w*::'
"let g:neocomplete#force_omni_input_patterns.java = '[^. *\t]\.\w*\|\h\w*::'


au BufRead,BufNewFile,BufReadPre *.coffee  set filetype=coffee
au BufWritePost *.coffee silent make!
au QuickFixCmdPost * nested cwindow | redraw!

" jedi.vim
au FileType python setlocal omnifunc=jedi#completions
au FileType python setlocal completeopt-=preview


au FileType java setl tabstop=2 expandtab shiftwidth=2 softtabstop=2 autoindent

au FileType ruby setlocal expandtab shiftwidth=2 tabstop=2 softtabstop=2 smartindent cinwords=if,elif,else,for,while,try,except,finally,def,class


au Filetype coffee,javascript setlocal shiftwidth=2 softtabstop=2 tabstop=2 expandtab autoindent smartindent omnifunc=jscpmplete#CompleteJS

syntax enable
set background=dark
colorscheme PaperColor

