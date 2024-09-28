local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.default_prog = { '/opt/homebrew/bin/fish', '-l' }

-- https://wezfurlong.org/wezterm/colorschemes/m/index.html
-- config.color_scheme = 'Material (base16)'
config.color_scheme = 'OceanicNext (base16)'
-- config.color_scheme = 'Codeschool (dark) (terminal.sexy)'

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
