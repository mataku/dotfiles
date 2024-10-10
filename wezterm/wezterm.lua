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

config.enable_scroll_bar = false
config.show_tab_index_in_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true

local act = wezterm.action

config.keys = {
  { key = 'LeftArrow', mods = 'CMD', action = act.MoveTabRelative(-1) },
  { key = 'RightArrow', mods = 'CMD', action = act.MoveTabRelative(1) },
}

function basename(s)
  return string.gsub(s, '(.*[/\\])(.*)', '%2')
end

function split_path(path)
  local result = {}
  for part in string.gmatch(path, "([^/]+)") do
    table.insert(result, part)
  end
  return result
end

function prompt_pwd(current_dir)
  local simple_home_path = string.gsub(current_dir, "^/Users/mataku", '~')

  local path_array = split_path(simple_home_path)
  local result = ""
  local path_array_size = #path_array

  for i, val in ipairs(path_array) do
    if (result == '') then
      result = result .. string.sub(val, 1, 1)
    elseif (i == path_array_size) then
      result = result .. '/' .. val
    else
      result = result .. '/' .. string.sub(val, 1, 1)
    end
  end

  return result
end

wezterm.on('format-window-title', function(tab, pane, tabs, panes, config)
  return prompt_pwd(pane.current_working_dir.path)
end)

wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local active_pane = tab.active_pane
  local process_name = active_pane.foreground_process_name
  return basename(active_pane.current_working_dir.path) .. ' ' .. '(' .. basename(process_name) .. ')'
end)

return config
