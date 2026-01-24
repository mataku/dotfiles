return {
  -- Use global ruby-lsp installation
  cmd = { 'ruby-lsp' },
  filetypes = { 'ruby' },
  root_markers = { 'Gemfile', '.git' },
  init_options = {
    -- Optional: configure formatter (can be 'rubocop', 'syntax_tree', or 'none')
    formatter = 'auto',
  },
}
