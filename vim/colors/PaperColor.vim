" Theme: PaperColor
" Author: Nguyen Nguyen <NLKNguyen@MSN.com>
" License: MIT
" Origin: http://github.com/NLKNguyen/papercolor-theme.git
"
" Modified from the theme 'Tomorrow'

hi clear
syntax reset
let g:colors_name = "PaperColor"

" Helper Functions: {{{
" Returns an approximate grey index for the given grey level
fun s:grey_number(x)
  if &t_Co == 88
    if a:x < 23
      return 0
    elseif a:x < 69
      return 1
    elseif a:x < 103
      return 2
    elseif a:x < 127
      return 3
    elseif a:x < 150
      return 4
    elseif a:x < 173
      return 5
    elseif a:x < 196
      return 6
    elseif a:x < 219
      return 7
    elseif a:x < 243
      return 8
    else
      return 9
    endif
  else
    if a:x < 14
      return 0
    else
      let l:n = (a:x - 8) / 10
      let l:m = (a:x - 8) % 10
      if l:m < 5
        return l:n
      else
        return l:n + 1
      endif
    endif
  endif
endfun

" Returns the actual grey level represented by the grey index
fun s:grey_level(n)
  if &t_Co == 88
    if a:n == 0
      return 0
    elseif a:n == 1
      return 46
    elseif a:n == 2
      return 92
    elseif a:n == 3
      return 115
    elseif a:n == 4
      return 139
    elseif a:n == 5
      return 162
    elseif a:n == 6
      return 185
    elseif a:n == 7
      return 208
    elseif a:n == 8
      return 231
    else
      return 255
    endif
  else
    if a:n == 0
      return 0
    else
      return 8 + (a:n * 10)
    endif
  endif
endfun

" Returns the palette index for the given grey index
fun s:grey_colour(n)
  if &t_Co == 88
    if a:n == 0
      return 16
    elseif a:n == 9
      return 79
    else
      return 79 + a:n
    endif
  else
    if a:n == 0
      return 16
    elseif a:n == 25
      return 231
    else
      return 231 + a:n
    endif
  endif
endfun

" Returns an approximate colour index for the given colour level
fun s:rgb_number(x)
  if &t_Co == 88
    if a:x < 69
      return 0
    elseif a:x < 172
      return 1
    elseif a:x < 230
      return 2
    else
      return 3
    endif
  else
    if a:x < 75
      return 0
    else
      let l:n = (a:x - 55) / 40
      let l:m = (a:x - 55) % 40
      if l:m < 20
        return l:n
      else
        return l:n + 1
      endif
    endif
  endif
endfun

" Returns the actual colour level for the given colour index
fun s:rgb_level(n)
  if &t_Co == 88
    if a:n == 0
      return 0
    elseif a:n == 1
      return 139
    elseif a:n == 2
      return 205
    else
      return 255
    endif
  else
    if a:n == 0
      return 0
    else
      return 55 + (a:n * 40)
    endif
  endif
endfun

" Returns the palette index for the given R/G/B colour indices
fun s:rgb_colour(x, y, z)
  if &t_Co == 88
    return 16 + (a:x * 16) + (a:y * 4) + a:z
  else
    return 16 + (a:x * 36) + (a:y * 6) + a:z
  endif
endfun

" Returns the palette index to approximate the given R/G/B colour levels
fun s:colour(r, g, b)
  " Get the closest grey
  let l:gx = s:grey_number(a:r)
  let l:gy = s:grey_number(a:g)
  let l:gz = s:grey_number(a:b)

  " Get the closest colour
  let l:x = s:rgb_number(a:r)
  let l:y = s:rgb_number(a:g)
  let l:z = s:rgb_number(a:b)

  if l:gx == l:gy && l:gy == l:gz
    " There are two possibilities
    let l:dgr = s:grey_level(l:gx) - a:r
    let l:dgg = s:grey_level(l:gy) - a:g
    let l:dgb = s:grey_level(l:gz) - a:b
    let l:dgrey = (l:dgr * l:dgr) + (l:dgg * l:dgg) + (l:dgb * l:dgb)
    let l:dr = s:rgb_level(l:gx) - a:r
    let l:dg = s:rgb_level(l:gy) - a:g
    let l:db = s:rgb_level(l:gz) - a:b
    let l:drgb = (l:dr * l:dr) + (l:dg * l:dg) + (l:db * l:db)
    if l:dgrey < l:drgb
      " Use the grey
      return s:grey_colour(l:gx)
    else
      " Use the colour
      return s:rgb_colour(l:x, l:y, l:z)
    endif
  else
    " Only one possibility
    return s:rgb_colour(l:x, l:y, l:z)
  endif
endfun

" Returns the palette index to approximate the '#rrggbb' hex string
fun s:rgb(rgb)
  let l:r = ("0x" . strpart(a:rgb, 1, 2)) + 0
  let l:g = ("0x" . strpart(a:rgb, 3, 2)) + 0
  let l:b = ("0x" . strpart(a:rgb, 5, 2)) + 0

  return s:colour(l:r, l:g, l:b)
endfun

" Sets the highlighting for the given group
fun s:HL(group, fg, bg, attr)
  if !empty(a:fg)
    " echo "['" . a:fg . "', " . s:rgb(a:fg) . "]"
    exec "hi " . a:group . " guifg=" . a:fg[0] . " ctermfg=" . a:fg[1]
  endif
  if !empty(a:bg)
    " echo  "['" . a:bg . "', " . s:rgb(a:bg) . "]"
    exec "hi " . a:group . " guibg=" . a:bg[0] . " ctermbg=" . a:bg[1]
  endif
  if a:attr != ""
    exec "hi " . a:group . " gui=" . a:attr . " cterm=" . a:attr
  endif
endfun

fun s:Load_Settings_Override(custom)
  if has_key(a:custom, 'cursorline')
    let s:cursorline = [a:custom['cursorline'], '' . s:rgb(a:custom['cursorline'])]
  endif
  if has_key(a:custom, 'background')
    let s:background = [a:custom['background'], '' . s:rgb(a:custom['background'])]
  endif
  if has_key(a:custom, 'matchparen')
    let s:matchparen = [a:custom['matchparen'], '' . s:rgb(a:custom['matchparen'])]
  endif
  if has_key(a:custom, 'comment')
    let s:comment = [a:custom['comment'], '' . s:rgb(a:custom['comment'])]
  endif
endfun
" }}}

" Color Palette: {{{
let s:is_dark=(&background == 'dark')

if s:is_dark " DARK VARIANT
  " These color names are corresponding to the original light version,
  " and they don't represent the HEX code that they store in this block.
  let s:red     = ['#5faf5f', '71'] "Include/Exception
  let s:green   = ['#dfaf00', '178'] "Boolean/Special
  let s:blue    = ['#00afaf', '37'] "Keyword

  let s:pink    = ['#afdf00', '148'] "Type
  let s:olive   = ['#dfaf5f', '179'] "String
  let s:navy    = ['#df875f', '173'] "StorageClass

  let s:orange  = ['#ff5faf', '205'] "Number
  let s:purple  = ['#af87af', '139'] "Repeat/Conditional
  let s:aqua    = ['#5fafdf', '74'] "Operator/Delimiter

  let s:wine  = ['#af8787', '138']

  " Basics:
  let s:foreground   = ['#d0d0d0', '251']
  let s:background   = ['#262626', '234']
  "let s:background   = ['#283540', '234']
  let s:selection    = ['#3a3a3a', '236']
  let s:nontext      = ['#444444', '237']
  let s:window       = ['#3a3a3a', '236']
  let s:divider      = ['#5f8787', '66']
  let s:linenumber   = ['#606060', '240']
  let s:comment      = ['#8a8a8a', '244']
  let s:todo         = ['#ff8700', '208']
  let s:cursorline   = ['#303030', '235']
  let s:cursorcolumn = ['#303030', '235']
  let s:error        = ['#5f0000', '52']
  let s:matchparen   = ['#4e4e4e', '239']

  " Spelling:
  let s:spellbad   = ['#5f0000', '52']
  let s:spellcap   = ['#5f005f', '53']
  let s:spellrare  = ['#005f00', '22']
  let s:spelllocal = ['#00005f', '17']

  " Tabline:
  let s:tabline_bg          = ['#3a3a3a', '235']
  let s:tabline_active_fg   = ['#1c1c1c', '233']
  let s:tabline_active_bg   = ['#00afaf', '37']
  let s:tabline_inactive_fg = ['#c6c6c6', '250']
  let s:tabline_inactive_bg = ['#585858', '240']

  " Statusline:
  let s:statusline_active_fg   = ['#1c1c1c', '233']
  let s:statusline_active_bg   = ['#5f8787', '66']
  let s:statusline_inactive_fg = ['#c6c6c6', '250']
  let s:statusline_inactive_bg = ['#444444', '237']

  " Search:
  let s:search_fg = ['#000000', '16']
  let s:search_bg = ['#00875f', '29']

  " Visual:
  let s:visual_fg = ['#000000', '16']
  let s:visual_bg = ['#8787af', '103']

  " Folded:
  let s:folded_fg = ['#afdf00', '148']
  let s:folded_bg = ['#444444', '237']

  " Diff:
  let s:diffadd_fg    = ['#000000', '16']
  let s:diffadd_bg    = ['#5faf00', '70']

  let s:diffdelete_fg = ['#5f0000', '52']
  let s:diffdelete_bg = ['#5f0000', '52']

  let s:difftext_fg   = ['#000000', '16']
  let s:difftext_bg   = ['#ffdf5f', '221']

  let s:diffchange_fg = ['#000000', '16']
  let s:diffchange_bg = ['#dfaf00', '178']

  " User Override Settings:
  if exists("g:PaperColor_Dark_Override")
    call s:Load_Settings_Override(g:PaperColor_Dark_Override)
  endif


else " LIGHT VARIANT

  let s:red     = ['#df0000', '160'] "Include/Exception
  let s:green   = ['#008700', '28'] "Boolean/Special
  let s:blue    = ['#4271ae', '25'] "Keyword

  let s:pink    = ['#d7005f', '161'] "Type
  let s:olive   = ['#718c00', '64'] "String
  let s:navy    = ['#005f87', '24'] "StorageClass

  let s:orange  = ['#d75f00', '166'] "Number
  let s:purple  = ['#8959a8', '97'] "Repeat/Conditional
  let s:aqua    = ['#3e999f', '31'] "Operator/Delimiter

  let s:wine  = ['#870087', '90']

  " Basics:
  let s:foreground   = ['#444444', '238']
  " let s:background   = ['#F5F5F5', '255']
  let s:background   = ['#283540', '234']
  let s:selection    = ['#d0d0d0', '252']
  let s:nontext      = ['#dfafff', '189']
  let s:window       = ['#e4e4e4', '254']
  let s:divider      = s:navy
  let s:linenumber   = ['#bcbcbc', '249']
  let s:comment      = ['#878787', '102']
  let s:todo         = ['#00af5f', '35']
  let s:cursorline   = ['#e4e4e4', '254']
  let s:cursorcolumn = ['#e4e4e4', '254']
  let s:error        = ['#ffafdf', '218']
  let s:matchparen   = ['#c6c6c6', '251']

  " Spelling:
  let s:spellbad   = ['#ffafdf', '218']
  let s:spellcap   = ['#ffffaf', '229']
  let s:spellrare  = ['#afff87', '156']
  let s:spelllocal = ['#dfdfff', '189']

  " Tabline:
  let s:tabline_bg          = s:navy
  let s:tabline_active_fg   = s:foreground
  let s:tabline_active_bg   = s:window
  let s:tabline_inactive_fg = s:background
  let s:tabline_inactive_bg = s:aqua

  " Statusline:
  let s:statusline_active_fg   = s:window
  let s:statusline_active_bg   = s:navy
  let s:statusline_inactive_fg = s:foreground
  let s:statusline_inactive_bg = ['#d0d0d0', '252']

  " Search:
  let s:search_fg = s:foreground
  let s:search_bg = ['#ffff5f', '227']

  " Visual:
  let s:visual_fg = s:background
  let s:visual_bg = s:blue

  " Folded:
  let s:folded_fg = s:navy
  let s:folded_bg = ['#afdfff', '153']

  " Diff:
  let s:diffadd_fg    = []
  let s:diffadd_bg    = ['#afffaf', '157']

  let s:diffdelete_fg = ['#ffdfff', '225']
  let s:diffdelete_bg = ['#ffdfff', '225']

  let s:difftext_fg   = []
  let s:difftext_bg   = ['#ffffdf', '230']

  let s:diffchange_fg = []
  let s:diffchange_bg = ['#ffffaf', '229']

  " User Override Settings:
  if exists("g:PaperColor_Light_Override")
    call s:Load_Settings_Override(g:PaperColor_Light_Override)
  endif
endif
" }}}

" Syntax Highlighting: {{{
if has("gui_running") || &t_Co == 88 || &t_Co == 256

  " Vim Highlighting
  call s:HL("Normal", s:foreground, s:background, "")

  " Switching between dark & light variant through `set background`
  " https://github.com/NLKNguyen/papercolor-theme/pull/20
  if s:is_dark " DARK VARIANT
    set background=dark
  else " LIGHT VARIANT
    set background=light
  endif

  highlight LineNr term=bold cterm=NONE ctermfg=darkgrey ctermbg=NONE gui=NONE guifg=darkgrey guibg=NONE
  call s:HL("NonText", s:nontext, "", "")
  call s:HL("SpecialKey", s:nontext, "", "")
  call s:HL("Search", s:search_fg, s:search_bg, "")
  call s:HL("LineNr", s:linenumber, "", "")
  call s:HL("TabLine", s:tabline_inactive_fg, s:tabline_inactive_bg, "None")
  call s:HL("TabLineFill", "", s:tabline_bg, "None")
  call s:HL("TabLineSel", s:tabline_active_fg, s:tabline_active_bg, "None")
  call s:HL("StatusLine", s:statusline_active_fg, s:statusline_active_bg, "bold")
  call s:HL("StatusLineNC", s:statusline_inactive_fg, s:statusline_inactive_bg, "None")
  call s:HL("VertSplit", s:divider, s:background, "none")
  call s:HL("Visual", s:visual_fg, s:visual_bg, "")
  call s:HL("Directory", s:blue, "", "")
  call s:HL("ModeMsg", s:olive, "", "")
  call s:HL("MoreMsg", s:olive, "", "")
  call s:HL("Question", s:olive, "", "")
  call s:HL("WarningMsg", s:pink, "", "")
  call s:HL("MatchParen", "", s:matchparen, "")
  call s:HL("Folded", s:folded_fg, s:folded_bg, "")
  call s:HL("FoldColumn", "", s:background, "")
  if version >= 700
    call s:HL("CursorLine", "", s:cursorline, "none")
    call s:HL("CursorColumn", "", s:cursorcolumn, "none")
    call s:HL("PMenu", s:foreground, s:selection, "none")
    call s:HL("PMenuSel", s:foreground, s:selection, "reverse")
    call s:HL("SignColumn", "", s:background, "none")
  end
  if version >= 703
    call s:HL("ColorColumn", "", s:cursorcolumn, "none")
  end

  " Standard Group Highlighting:
  call s:HL("Comment", s:comment, "", "")

  call s:HL("Constant", s:orange, "", "")
  call s:HL("String", s:olive, "", "")
  call s:HL("Character", s:olive, "", "")
  call s:HL("Number", s:orange, "", "")
  call s:HL("Boolean", s:green, "", "bold")
  call s:HL("Float", s:orange, "", "")

  call s:HL("Identifier", s:navy, "", "")
  call s:HL("Function", s:foreground, "", "")

  call s:HL("Statement", s:pink, "", "")
  call s:HL("Conditional", s:purple, "", "bold")
  call s:HL("Repeat", s:purple, "", "bold")
  call s:HL("Label", s:blue, "", "")
  call s:HL("Operator", s:aqua, "", "none")
  call s:HL("Keyword", s:blue, "", "")
  call s:HL("Exception", s:red, "", "")

  call s:HL("PreProc", s:blue, "", "")
  call s:HL("Include", s:red, "", "")
  call s:HL("Define", s:blue, "", "")
  call s:HL("Macro", s:blue, "", "")
  call s:HL("PreCondit", s:aqua, "", "")

  call s:HL("Type", s:pink, "", "bold")
  call s:HL("StorageClass", s:navy, "", "bold")
  call s:HL("Structure", s:blue, "", "bold")
  call s:HL("Typedef", s:pink, "", "bold")

  call s:HL("Special", s:foreground, "", "")
  call s:HL("SpecialChar", s:foreground, "", "")
  call s:HL("Tag", s:green, "", "")
  call s:HL("Delimiter",s:aqua, "", "")
  call s:HL("SpecialComment", s:comment, "", "bold")
  call s:HL("Debug", s:orange, "", "")

  "call s:HL("Ignore", "666666", "", "")

  call s:HL("Error", s:foreground, s:error, "")
  call s:HL("Todo", s:todo, s:background, "bold")

  call s:HL("Title", s:comment, "", "")
  call s:HL("Global", s:blue, "", "")


  " Extension {{{
  " VimL Highlighting
  call s:HL("vimCommand", s:pink, "", "none")
  call s:HL("vimVar", s:navy, "", "")
  call s:HL("vimFuncKey", s:pink, "", "")
  call s:HL("vimFunction", s:blue, "", "bold")
  call s:HL("vimNotFunc", s:pink, "", "")
  call s:HL("vimMap", s:red, "", "")
  call s:HL("vimAutoEvent", s:aqua, "", "bold")
  call s:HL("vimMapModKey", s:aqua, "", "")
  call s:HL("vimFuncName", s:purple, "", "")
  call s:HL("vimIsCommand", s:foreground, "", "")
  call s:HL("vimFuncVar", s:aqua, "", "")
  call s:HL("vimLet", s:red, "", "")
  call s:HL("vimMapRhsExtend", s:foreground, "", "")
  call s:HL("vimCommentTitle", s:comment, "", "bold")
  call s:HL("vimBracket", s:aqua, "", "")
  call s:HL("vimParenSep", s:aqua, "", "")
  call s:HL("vimSynType", s:olive, "", "bold")
  call s:HL("vimNotation", s:aqua, "", "")
  call s:HL("vimOper", s:foreground, "", "")
  call s:HL("vimOperParen", s:foreground, "", "")

  " Makefile Highlighting
  call s:HL("makeIdent", s:blue, "", "")
  call s:HL("makeSpecTarget", s:olive, "", "")
  call s:HL("makeTarget", s:red, "", "")
  call s:HL("makeStatement", s:aqua, "", "bold")
  call s:HL("makeCommands", s:foreground, "", "")
  call s:HL("makeSpecial", s:orange, "", "bold")

  " CMake Highlighting
  call s:HL("cmakeStatement", s:pink, "", "")
  call s:HL("cmakeArguments", s:foreground, "", "")
  call s:HL("cmakeVariableValue", s:blue, "", "")
  call s:HL("cmakeOperators", s:red, "", "")

  " C Highlighting
  call s:HL("cType", s:pink, "", "bold")
  call s:HL("cFormat", s:olive, "", "")
  call s:HL("cStorageClass", s:navy, "", "bold")

  call s:HL("cBoolean", s:green, "", "")
  call s:HL("cCharacter", s:olive, "", "")
  call s:HL("cConstant", s:green, "", "bold")
  call s:HL("cConditional", s:purple, "", "bold")
  call s:HL("cSpecial", s:olive, "", "bold")
  call s:HL("cDefine", s:blue, "", "")
  call s:HL("cNumber", s:orange, "", "")
  call s:HL("cPreCondit", s:aqua, "", "")
  call s:HL("cRepeat", s:purple, "", "bold")
  call s:HL("cLabel",s:aqua, "", "")
  call s:HL("cDelimiter",s:blue, "", "")
  call s:HL("cOperator",s:aqua, "", "")
  call s:HL("cFunction", s:foreground, "", "")
  call s:HL("cCustomParen", s:foreground, "", "")
  call s:HL("cOctalZero", s:purple, "", "bold")

  " GAS highlighting
  call s:HL("gasSymbol", s:pink, "", "")
  call s:HL("gasDirective", s:blue, "", "bold")
  call s:HL("gasOpcode_386_Base", s:navy, "", "")
  call s:HL("gasDecimalNumber", s:purple, "", "")
  call s:HL("gasSymbolRef", s:pink, "", "")
  call s:HL("gasRegisterX86", s:blue, "", "")
  call s:HL("gasOpcode_P6_Base", s:navy, "", "")
  call s:HL("gasDirectiveStore", s:foreground, "", "bold")

  " Shell/Bash highlighting
  call s:HL("bashStatement", s:foreground, "", "bold")
  call s:HL("shDerefVar", s:aqua, "", "bold")
  call s:HL("shDerefSimple", s:aqua, "", "")
  call s:HL("shFunction", s:orange, "", "bold")
  call s:HL("shStatement", s:foreground, "", "")
  call s:HL("shLoop", s:purple, "", "bold")
  call s:HL("shQuote", s:olive, "", "")
  call s:HL("shCaseEsac", s:aqua, "", "bold")
  call s:HL("shSnglCase", s:purple, "", "none")
  call s:HL("shFunctionOne", s:navy, "", "")
  call s:HL("shCase", s:navy, "", "")
  call s:HL("shSetList", s:navy, "", "")
  " @see Dockerfile Highlighting section for more sh*

  " HTML Highlighting
  call s:HL("htmlTitle", s:green, "", "bold")
  call s:HL("htmlH1", s:green, "", "bold")
  call s:HL("htmlH2", s:aqua, "", "bold")
  call s:HL("htmlH3", s:purple, "", "bold")
  call s:HL("htmlH4", s:orange, "", "bold")
  call s:HL("htmlTag", s:comment, "", "")
  call s:HL("htmlTagName", s:wine, "", "")
  call s:HL("htmlArg", s:pink, "", "")
  call s:HL("htmlEndTag", s:comment, "", "")
  call s:HL("htmlString", s:blue, "", "")
  call s:HL("htmlScriptTag", s:comment, "", "")
  call s:HL("htmlBold", s:foreground, "", "bold")
  call s:HL("htmlItalic", s:comment, "", "bold")
  call s:HL("htmlBoldItalic", s:navy, "", "bold")
  " call s:HL("htmlLink", s:blue, "", "bold")
  call s:HL("htmlTagN", s:wine, "", "bold")
  call s:HL("htmlSpecialTagName", s:wine, "", "")
  call s:HL("htmlComment", s:comment, "", "")
  call s:HL("htmlCommentPart", s:comment, "", "")

  " CSS Highlighting
  call s:HL("cssIdentifier", s:pink, "", "")
  call s:HL("cssPositioningProp", s:foreground, "", "")
  call s:HL("cssNoise", s:foreground, "", "")
  call s:HL("cssBoxProp", s:foreground, "", "")
  call s:HL("cssTableAttr", s:purple, "", "")
  call s:HL("cssPositioningAttr", s:navy, "", "")
  call s:HL("cssValueLength", s:orange, "", "")

call s:HL("cssFunctionName", s:blue, "", "")
call s:HL("cssUnitDecorators", s:aqua, "", "")
call s:HL("cssColor", s:blue, "", "bold")
call s:HL("cssBraces", s:pink, "", "")
call s:HL("cssBackgroundProp", s:foreground, "", "")
call s:HL("cssTextProp", s:foreground, "", "")
call s:HL("cssDimensionProp", s:foreground, "", "")
call s:HL("cssClassName", s:pink, "", "")

  " Markdown Highlighting
  call s:HL("markdownH1", s:pink, "", "bold")
  call s:HL("markdownBlockquote", s:pink, "", "")
  call s:HL("markdownCodeBlock", s:purple, "", "bold")
  call s:HL("markdownLink", s:blue, "", "bold")
  call s:HL("mkdCode", s:olive, "", "none")
  call s:HL("mkdLink", s:blue, "", "bold")
  call s:HL("mkdURL", s:comment, "", "none")
  call s:HL("mkdString", s:foreground, "", "none")
  call s:HL("mkdBlockQuote", s:foreground, s:window, "none")
  call s:HL("mkdLinkTitle", s:pink, "", "none")
  call s:HL("mkdDelimiter", s:aqua, "", "")
  call s:HL("mkdRule", s:pink, "", "")

  " Python Highlighting
  call s:HL("pythonImport", s:pink, "", "bold")
  call s:HL("pythonExceptions", s:red, "", "")
  call s:HL("pythonException", s:purple, "", "bold")
  call s:HL("pythonInclude", s:red, "", "")
  call s:HL("pythonStatement", s:pink, "", "")
  call s:HL("pythonConditional", s:purple, "", "bold")
  call s:HL("pythonRepeat", s:purple, "", "bold")
  call s:HL("pythonFunction", s:aqua, "", "bold")
  call s:HL("pythonPreCondit", s:purple, "", "")
  call s:HL("pythonExClass", s:orange, "", "")
  call s:HL("pythonOperator", s:purple, "", "bold")
  call s:HL("pythonBuiltin", s:foreground, "", "")
  call s:HL("pythonDecorator", s:orange, "", "")

  call s:HL("pythonString", s:olive, "", "")
  call s:HL("pythonEscape", s:olive, "", "bold")
  call s:HL("pythonStrFormatting", s:olive, "", "bold")

  call s:HL("pythonBoolean", s:green, "", "bold")
  call s:HL("pythonExClass", s:red, "", "")
  call s:HL("pythonBytesEscape", s:olive, "", "bold")
  call s:HL("pythonDottedName", s:purple, "", "")
  call s:HL("pythonStrFormat", s:foreground, "", "")
  call s:HL("pythonBuiltinFunc", s:foreground, "", "")
  call s:HL("pythonBuiltinObj", s:foreground, "", "")

  " Java Highlighting
  call s:HL("javaExternal", s:pink, "", "")
  call s:HL("javaAnnotation", s:orange, "", "")
  call s:HL("javaTypedef", s:aqua, "", "")
  call s:HL("javaClassDecl", s:aqua, "", "bold")
  call s:HL("javaScopeDecl", s:blue, "", "bold")
  call s:HL("javaStorageClass", s:navy, "", "bold")
  call s:HL("javaBoolean", s:navy, "", "")
  call s:HL("javaCommentTitle", s:wine, "", "")
  call s:HL("javaDocTags", s:aqua, "", "")
  call s:HL("javaDocComment", s:comment, "", "")
  call s:HL("javaDocParam", s:foreground, "", "")

  " JavaScript Highlighting
  call s:HL("javaScriptBraces", s:blue, "", "")
  call s:HL("javaScriptParens", s:blue, "", "")
  call s:HL("javaScriptIdentifier", s:navy, "", "bold")
  call s:HL("javaScriptFunction", s:pink, "", "bold")
  call s:HL("javaScriptConditional", s:purple, "", "bold")
  call s:HL("javaScriptRepeat", s:purple, "", "bold")
  call s:HL("javaScriptBoolean", s:orange, "", "")
  " call s:HL("javaScriptNumber", s:orange, "", "")
  call s:HL("javaScriptMember", s:navy, "", "")
  " call s:HL("javascriptNull", s:orange, "", "")
  " call s:HL("javascriptGlobal", s:blue, "", "")
  " call s:HL("javascriptStatement", s:pink, "", "")

  " @target https://github.com/pangloss/vim-javascript
  call s:HL("jsFuncParens", s:blue, "", "")
  call s:HL("jsFuncBraces", s:blue, "", "")
  call s:HL("jsParens", s:blue, "", "")
  call s:HL("jsBraces", s:blue, "", "")
  call s:HL("jsNoise", s:blue, "", "")

  " Json Highlighting
  " @target https://github.com/elzr/vim-json
  call s:HL("jsonKeyword", s:blue, "", "")
  call s:HL("jsonString", s:olive, "", "")
  call s:HL("jsonQuote", s:comment, "", "")
  call s:HL("jsonNoise", s:foreground, "", "")
  call s:HL("jsonKeywordMatch", s:foreground, "", "")
  call s:HL("jsonBraces", s:foreground, "", "")
  call s:HL("jsonNumber", s:orange, "", "")
  call s:HL("jsonNull", s:purple, "", "bold")
  call s:HL("jsonBoolean", s:green, "", "bold")
  call s:HL("jsonCommentError", s:pink, s:background , "")

  " Go Highlighting
  call s:HL("goDirective", s:red, "", "")
  call s:HL("goDeclaration", s:blue, "", "bold")
  call s:HL("goStatement", s:pink, "", "")
  call s:HL("goConditional", s:purple, "", "bold")
  call s:HL("goConstants", s:orange, "", "")
  call s:HL("goFunction", s:orange, "", "")
  call s:HL("goDeclType", s:blue, "", "")
  call s:HL("goBuiltins", s:purple, "", "")

  " DTrace Highlighting
  call s:HL("dtraceProbe", s:blue, "", "")
  call s:HL("dtracePredicate", s:purple, "", "bold")
  call s:HL("dtraceComment", s:comment, "", "")
  call s:HL("dtraceFunction", s:foreground, "", "")
  call s:HL("dtraceAggregatingFunction", s:blue, "", "bold")
  call s:HL("dtraceStatement", s:navy, "", "bold")
  call s:HL("dtraceIdentifier", s:pink, "", "")
  call s:HL("dtraceOption", s:pink, "", "")
  call s:HL("dtraceConstant", s:orange, "", "")
  call s:HL("dtraceType", s:pink, "", "bold")

  " Haskell Highlighting
  call s:HL("haskellType", s:aqua, "", "bold")
  call s:HL("haskellIdentifier", s:orange, "", "bold")
  call s:HL("haskellOperators", s:pink, "", "")
  call s:HL("haskellWhere", s:foreground, "", "bold")
  call s:HL("haskellDelimiter", s:aqua, "", "")
  call s:HL("haskellImportKeywords", s:pink, "", "")
  call s:HL("haskellStatement", s:purple, "", "bold")

  " Ruby Highlighting
  call s:HL("rubyModule", s:navy, "", "bold")
  call s:HL("rubyClass", s:pink, "", "bold")
  call s:HL("rubyPseudoVariable", s:comment, "", "bold")
  call s:HL("rubyKeyword", s:pink, "", "")
  call s:HL("rubyInstanceVariable", s:purple, "", "")
  call s:HL("rubyFunction", s:foreground, "", "bold")
  call s:HL("rubyDefine", s:pink, "", "")
  call s:HL("rubySymbol", s:aqua, "", "")
  call s:HL("rubyConstant", s:blue, "", "")
  call s:HL("rubyAccess", s:navy, "", "")
  call s:HL("rubyAttribute", s:green, "", "")
  call s:HL("rubyInclude", s:red, "", "")
  call s:HL("rubyLocalVariableOrMethod", s:orange, "", "")
  call s:HL("rubyCurlyBlock", s:foreground, "", "")
  call s:HL("rubyCurlyBlockDelimiter", s:aqua, "", "")
  call s:HL("rubyArrayDelimiter", s:aqua, "", "")
  call s:HL("rubyStringDelimiter", s:olive, "", "")
  call s:HL("rubyInterpolationDelimiter", s:orange, "", "")
  call s:HL("rubyConditional", s:purple, "", "bold")
  call s:HL("rubyRepeat", s:purple, "", "bold")
  call s:HL("rubyControl", s:purple, "", "bold")
  call s:HL("rubyException", s:purple, "", "bold")
  call s:HL("rubyExceptional", s:purple, "", "bold")
  call s:HL("rubyBoolean", s:green, "", "bold")

  " R Highlighting
  call s:HL("rType", s:blue, "", "")
  call s:HL("rArrow", s:pink, "", "")
  call s:HL("rDollar", s:blue, "", "")

  " PHP Highlighting
  call s:HL("phpIdentifier", s:foreground, "", "")
  call s:HL("phpVarSelector", s:pink, "", "")
  call s:HL("phpKeyword", s:blue, "", "")
  call s:HL("phpRepeat", s:purple, "", "bold")
  call s:HL("phpConditional", s:purple, "", "bold")
  call s:HL("phpStatement", s:pink, "", "")
  call s:HL("phpAssignByRef", s:aqua, "", "bold")
  call s:HL("phpSpecialFunction", s:blue, "", "")
  call s:HL("phpFunctions", s:blue, "", "")
  call s:HL("phpComparison", s:aqua, "", "")
  call s:HL("phpBackslashSequences", s:olive, "", "bold")
  call s:HL("phpMemberSelector", s:blue, "", "")
  call s:HL("phpStorageClass", s:purple, "", "bold")
  call s:HL("phpDefine", s:navy, "", "")

  " Dockerfile Highlighting
  " @target https://github.com/docker/docker/tree/master/contrib/syntax/vim
  call s:HL("dockerfileKeyword", s:blue, "", "")
  call s:HL("shDerefVar", s:purple, "", "bold")
  call s:HL("shOperator", s:aqua, "", "")
  call s:HL("shOption", s:navy, "", "")
  call s:HL("shLine", s:foreground, "", "")
  call s:HL("shWrapLineOperator", s:pink, "", "")

  " NGINX Highlighting
  " @target https://github.com/evanmiller/nginx-vim-syntax
  call s:HL("ngxDirectiveBlock", s:pink, "", "bold")
  call s:HL("ngxDirective", s:blue, "", "none")
  call s:HL("ngxDirectiveImportant", s:blue, "", "bold")
  call s:HL("ngxString", s:olive, "", "")
  call s:HL("ngxVariableString", s:purple, "", "")
  call s:HL("ngxVariable", s:purple, "", "none")

  " Yaml Highlighting
  call s:HL("yamlBlockMappingKey", s:blue, "", "")
  call s:HL("yamlKeyValueDelimiter", s:pink, "", "")
  call s:HL("yamlBlockCollectionItemStart", s:pink, "", "")

  " Mail highlighting
  call s:HL("mailHeaderKey", s:blue, "", "")
  call s:HL("mailHeaderEmail", s:purple, "", "")
  call s:HL("mailSubject", s:pink, "", "")
  call s:HL("mailHeader", s:comment, "", "")
  call s:HL("mailURL", s:aqua, "", "")
  call s:HL("mailEmail", s:purple, "", "")
  call s:HL("mailQuoted1", s:olive, "", "")
  call s:HL("mailQuoted2", s:navy, "", "")

  " XML Highlighting
  call s:HL("xmlProcessingDelim", s:pink, "", "")
  call s:HL("xmlString", s:olive, "", "")
  call s:HL("xmlEqual", s:orange, "", "")
  call s:HL("xmlAttrib", s:navy, "", "")
  call s:HL("xmlAttribPunct", s:pink, "", "")
  call s:HL("xmlTag", s:wine, "", "")
  call s:HL("xmlTagName", s:wine, "", "")
  call s:HL("xmlEndTag", s:wine, "", "")
  call s:HL("xmlNamespace", s:blue, "", "")

  " }}}

  " Plugin: NERDTree
  call s:HL("NERDTreeUp", s:comment, "", "")
  call s:HL("NERDTreeHelpCommand", s:pink, "", "")
  call s:HL("NERDTreeHelpTitle", s:blue, "", "bold")
  call s:HL("NERDTreeHelpKey", s:pink, "", "")
  call s:HL("NERDTreeHelp", s:foreground, "", "")
  call s:HL("NERDTreeToggleOff", s:red, "", "")
  call s:HL("NERDTreeToggleOn", s:green, "", "")
  call s:HL("NERDTreeDir", s:aqua, "", "bold")
  call s:HL("NERDTreeExecFile", s:green, "", "")

  " Plugin: Tagbar
  call s:HL("TagbarHelpTitle", s:blue, "", "bold")
  call s:HL("TagbarHelp", s:foreground, "", "")
  call s:HL("TagbarKind", s:pink, "", "")
  call s:HL("TagbarSignature", s:aqua, "", "")

  " Plugin: Vimdiff
  call s:HL("DiffAdd",    s:diffadd_fg,    s:diffadd_bg,    "none")
  call s:HL("DiffChange", s:diffchange_fg, s:diffchange_bg, "none")
  call s:HL("DiffDelete", s:diffdelete_fg, s:diffdelete_bg, "none")
  call s:HL("DiffText",   s:difftext_fg,   s:difftext_bg,   "none")

  " Plugin: Spell Checking
  call s:HL("SpellBad",   s:foreground, s:spellbad,   "")
  call s:HL("SpellCap",   s:foreground, s:spellcap,   "")
  call s:HL("SpellRare",  s:foreground, s:spellrare,  "")
  call s:HL("SpellLocal", s:foreground, s:spelllocal, "")

  " Plugin: Indent Guides
  call s:HL("IndentGuidesOdd", "", s:background, "")
  call s:HL("IndentGuidesEven", "", s:cursorline, "")

  " Plugin: Startify
  call s:HL("StartifyFile", s:blue, "", "bold")
  call s:HL("StartifyPath", s:foreground, "", "")
  call s:HL("StartifySlash", s:navy, "", "")
  call s:HL("StartifyBracket", s:aqua, "", "")
  call s:HL("StartifySpecial", s:aqua, "", "")

  " Git
  call s:HL("diffAdded", s:olive, "", "")
  call s:HL("diffRemoved", s:pink, "", "")
  call s:HL("gitcommitSummary", "", "", "bold")

endif
" }}}

" Delete Helper Functions: {{{
delf s:Load_Settings_Override
delf s:HL
delf s:rgb
delf s:colour
delf s:rgb_colour
delf s:rgb_level
delf s:rgb_number
delf s:grey_colour
delf s:grey_level
delf s:grey_number
" }}}

" vim: fdm=marker
