local wezterm = require 'wezterm'

local config = wezterm.config_builder()

local function file_exists(path)
  local f = io.open(path, "r")
  if f then
    f:close()
    return true
  end
  return false
end

if wezterm.target_triple == 'aarch64-apple-darwin' then
  local home = os.getenv("HOME")
  local nix_fish = home .. '/.nix-profile/bin/fish'
  if file_exists(nix_fish) then
    config.default_prog = { nix_fish, '-l' }
  else
    config.default_prog = { '/opt/homebrew/bin/fish', '-l' }
  end
end

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

config.unicode_version = 15
config.font = wezterm.font_with_fallback {
  { family = 'Cica' },
  { family = 'Cica', assume_emoji_presentation = true }
}
config.font_size = 14.0
config.adjust_window_size_when_changing_font_size = false

config.enable_scroll_bar = false
config.show_tab_index_in_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true

config.show_new_tab_button_in_tab_bar = false
-- config.show_close_tab_button_in_tabs = false

config.send_composed_key_when_left_alt_is_pressed = true

local act = wezterm.action

config.keys = {
  { key = 'LeftArrow', mods = 'CMD', action = act.ActivateTabRelative(-1) },
  { key = 'RightArrow', mods = 'CMD', action = act.ActivateTabRelative(1) },
  { key = '{', mods = 'CTRL|SHIFT', action = act.MoveTabRelative(-1) },
  { key = '}', mods = 'CTRL|SHIFT', action = act.MoveTabRelative(1) },
  { key = '=', mods = 'CTRL', action = act.DisableDefaultAssignment },
  { key = '_', mods = 'CTRL|SHIFT', action = act.DisableDefaultAssignment },
  { key = '_', mods = 'SHIFT', action = act.DisableDefaultAssignment },
  { key = '=', mods = 'SHIFT', action = act.DisableDefaultAssignment },
  { key = '-', mods = 'CTRL', action = act.DisableDefaultAssignment },
  { key = '-', mods = 'SHIFT', action = act.DisableDefaultAssignment },
  -- { key = '=', mods = 'CMD', action = act.IncreaseFontSize },
  -- { key = '-', mods = 'CMD', action = act.DecreaseFontSize },
  { key = '3', mods = 'OPT', action = act.DisableDefaultAssignment },
  {
    key = 'p',
    mods = 'CTRL',
    action = act.PaneSelect {
      alphabet = '1234567890',
    },
  },
}

-- config.macos_forward_to_ime_modifier_mask = 'CTRL|SHIFT'

config.mouse_bindings = {
  {
    event = { Up = { streak = 1, button = 'Left' } },
    mods = 'NONE',
    action = act.CompleteSelection 'ClipboardAndPrimarySelection',
  },

  -- CMD-Click for hyperlinks
  {
    event = { Up = { streak = 1, button = 'Left' } },
    mods = 'CMD',
    action = act.OpenLinkAtMouseCursor,
  }
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

function minified_home(current_dir)
  local home = os.getenv("HOME")
  if home and current_dir:sub(1, #home) == home then
    return "~" .. current_dir:sub(#home + 1)
  end
  return current_dir
end

function prompt_pwd(current_dir)
  local path_array = split_path(minified_home(current_dir))
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
  if (process_name == '') then
    return basename(active_pane.current_working_dir.path)
  else
    return basename(active_pane.current_working_dir.path) .. ' ' .. '(' .. basename(process_name) .. ')'
  end
end)

return config
