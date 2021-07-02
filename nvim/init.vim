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
let s:dein_dir = expand('~/.config/nvim/dein')
let s:dein_repo_dir = s:dein_dir . '/repos/github.com/Shougo/dein.vim'

if &runtimepath !~# '/dein.vim'
  if !isdirectory(s:dein_repo_dir)
    execute '!git clone https://github.com/Shougo/dein.vim' s:dein_repo_dir
  endif
endif

set runtimepath^=~/.config/nvim/dein/repos/github.com/Shougo/dein.vim

" Plugin list (toml)
let s:toml      = '~/.config/nvim/rc/dein.toml'
let s:lazy_toml = '~/.config/nvim/rc/dein_lazy.toml'

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
set clipboard=unnamed
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

if !has('nvim')
  call dein#add('roxma/nvim-yarp')
  call dein#add('roxma/vim-hug-neovim-rpc')
endif

if expand("%:t") =~ ".*\.go"
  let g:go_highlight_functions = 1
  let g:go_highlight_methods = 1
  let g:go_highlight_structs = 1
endif

set completeopt=menu

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

" GoTo code navigation.
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)
