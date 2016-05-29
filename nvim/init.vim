set encoding=utf-8
set nocompatible
set notitle
set mouse=a
set shell=zsh

set tabstop=2
set softtabstop=2
set shiftwidth=2
set autoindent
set clipboard=unnamedplus
set backspace=start,eol,indent
set expandtab

if &compatible
  set nocompatible
endif

" dein
" dir where plugins are installed

let s:nvim_home = expand('~/.config/nvim/')
let s:dein_dir = s:nvim_home . 'dein'
let s:dein_repo_dir = s:dein_dir . '/repos/github.com/Shougo/dein.vim'

if &runtimepath !~# '/dein.vim'
  if !isdirectory(s:dein_repo_dir)
    execute '!git clone https://github.com/Shougo/dein.vim' s:dein_repo_dir
  endif
endif

execute 'set runtimepath^=' . s:dein_repo_dir
set runtimepath+=$GOROOT/misc/vim

call dein#begin(s:dein_dir)

call dein#add('Shougo/dein.vim')
call dein#add('Shougo/vimproc.vim', {
  \ 'build' : {
  \   'mac' : 'make -f make_mac.mak',
  \   'unix': 'gmake',
  \   },
  \ })


" plugin list (toml)
let s:toml      = s:nvim_home . 'rc/dein.toml'
let s:lazy_toml = s:nvim_home . 'rc/dein_lazy.toml'

if dein#load_cache([expand('<sfile>'), s:toml, s:lazy_toml])
  call dein#load_toml(s:toml,      {'lazy': 0})
  call dein#load_toml(s:lazy_toml, {'lazy': 1})
  call dein#save_cache()
endif

call dein#end()

if dein#check_install()
  call dein#install()
endif



let g:deoplete#enable_at_startup = 1
let g:deoplete#enable_smart_case = 1
let g:deoplete#auto_completion_start_length = 2

filetype plugin indent on


if expand("%:t") =~ ".*\.py"

  let g:jedi#completions_enabled = 1
  let g:jedi#auto_vim_configulation = 0
  "let g:jedi#smart_auto_mappings = 0
  let g:jedi#popup_on_dot = 1
  "let g:jedi#show_call_signatures = 0
  let g:syntastic_python_checkers = ['pyflakes']
  "let g:jedi#force_py_version = 3

endif

set completeopt=menu

if !exists('g:deoplete#omni_patterns')
  let g:deoplete#omni_patterns = {}
endif

"let g:deoplete#omni_patterns.ruby = '[^. *\t]\.\w*\|\h\w*::'
let g:deoplete#omni_patterns.python = '[^. *\t]\.\w*\|\h\w*::'
"let g:deoplete#omni_patterns.ruby = '[^. *\t]\.\w*\|\h\w*::'


autocmd FileType python setl omnifunc=jedi#completions
autocmd FileType python setl completeopt-=preview

autocmd Filetype coffee,javascript setlocal shiftwidth=2 softtabstop=2 tabstop=2 expandtab autoindent smartindent

"set cmdheight=2
"let g:echodoc_enable_at_startup = 1
"set pumheight=15


syntax enable
set background=dark
colorscheme PaperColor
set number

set nowritebackup
set nobackup
set noswapfile
