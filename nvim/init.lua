local opt = vim.opt

vim.scriptencoding = 'utf-8'
opt.encoding = 'utf-8'
opt.laststatus = 2
vim.g.noshowmode = true

-- converted simply from vimscript
-- TODO: lua
vim.cmd([[
  if &compatible
    set nocompatible
  endif

  set tags=./tags,tags
  nnoremap <C-]> g<C-]>
  let NERDTreeShowHidden = 1
  autocmd vimenter * if !argc() | NERDTree | endif
  autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif

  
  " Setting options
  set notitle
  set mouse=a
  set shell=fish
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

  au BufRead,BufNewFile Fastfile set filetype=ruby
  au BufRead,BufNewFile IAMFile set filetype=ruby

  au FileType java setl tabstop=2 expandtab shiftwidth=2 softtabstop=2 autoindent

  au FileType ruby setlocal expandtab shiftwidth=2 tabstop=2 softtabstop=2 smartindent cinwords=if,elif,else,for,while,try,except,finally,def,class

  au FileType go setlocal noexpandtab tabstop=4 shiftwidth=4 autoindent

  au FileType gitcommit set omnifunc=emoji#complete filetype=markdown
  au FileType markdown set omnifunc=emoji#complete

  let g:PaperColor_Theme_Options = {
    \   'theme': {
    \     'default.dark': {
    \       'override' : {
    \         'color00' : ['#263137', '232'],
    \         'linenumber_bg' : ['263137', '232']
    \       }
    \     }
    \   }
    \ }

  syntax enable
  set background=dark
  set termguicolors

  " GoTo code navigation.
  "nmap <silent> gd <Plug>(coc-definition)
  "nmap <silent> gy <Plug>(coc-type-definition)
  "nmap <silent> gi <Plug>(coc-implementation)
  "nmap <silent> gr <Plug>(coc-references)
]])

require("config.lazy")
