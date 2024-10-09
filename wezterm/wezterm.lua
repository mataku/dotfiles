local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.default_prog = { '/opt/homebrew/bin/fish', '-l' }

config.colors = {
  foreground = '#eceef0',
  background = '#283137',
  cursor_bg = '#edeeed',
  cursor_border = '#eaeaea',
  cursor_fg = '#000000',
  selection_bg = '#657c89',
  selection_fg = '#eceef0',

  ansi = {
    '#596d78',
    '#eb5f59',
    '#8eedb3',
    '#f8d85e',
    '#68c1f9',
    '#eb5181',
    '#8ff8db',
    '#fefefe',
  },

  brights = {
    '#b2bdc4',
    '#ef9084',
    '#c5f4cd',
    '#fae58d',
    '#94d5fa',
    '#ee86aa',
    '#bafaeb',
    '#fefefe',
  }
}

config.font = wezterm.font_with_fallback {
  'Cica'
}
config.font_size = 14.0
config.adjust_window_size_when_changing_font_size = false

config.enable_scroll_bar = true
config.show_tab_index_in_tab_bar = false

local act = wezterm.action

config.keys = {
  { key = 'LeftArrow', mods = 'CMD', action = act.MoveTabRelative(-1) },
  { key = 'RightArrow', mods = 'CMD', action = act.MoveTabRelative(1) },
}

wezterm.on('format-window-title', function(tab, pane, tabs, panes, config)
  return 'WezTerm'
end)

return config
