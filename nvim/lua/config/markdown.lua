vim.api.nvim_set_hl(0, "MarkdownFrontmatterDelimiter", { fg = "#ffffff" })
vim.api.nvim_set_hl(0, "MarkdownFrontmatterKey", { fg = "#ff5370" })
vim.api.nvim_set_hl(0, "MarkdownFrontmatterValue", { fg = "#afd182" })

local frontmatter_ns = vim.api.nvim_create_namespace("markdown_frontmatter")

local function highlight_frontmatter(buf)
  vim.api.nvim_buf_clear_namespace(buf, frontmatter_ns, 0, -1)

  local lines = vim.api.nvim_buf_get_lines(buf, 0, 10, false)
  if #lines == 0 or lines[1] ~= "---" then return end

  local end_line = nil
  for i = 2, #lines do
    if lines[i] == "---" then
      end_line = i
      break
    end
  end
  if not end_line then return end

  vim.api.nvim_buf_set_extmark(buf, frontmatter_ns, 0, 0, {
    end_col = #lines[1],
    hl_group = "MarkdownFrontmatterDelimiter",
    priority = 200,
  })
  vim.api.nvim_buf_set_extmark(buf, frontmatter_ns, end_line - 1, 0, {
    end_col = #lines[end_line],
    hl_group = "MarkdownFrontmatterDelimiter",
    priority = 200,
  })

  for i = 2, end_line - 1 do
    local line = lines[i]
    local colon_pos = line:find(":")
    if colon_pos then
      vim.api.nvim_buf_set_extmark(buf, frontmatter_ns, i - 1, 0, {
        end_col = colon_pos - 1,
        hl_group = "MarkdownFrontmatterKey",
        priority = 200,
      })
      local value_start = line:find("%S", colon_pos + 1)
      if value_start then
        vim.api.nvim_buf_set_extmark(buf, frontmatter_ns, i - 1, value_start - 1, {
          end_col = #line,
          hl_group = "MarkdownFrontmatterValue",
          priority = 200,
        })
      end
    else
      local dash_end = line:find("-%s+")
      if dash_end then
        local value_start = line:find("%S", dash_end + 1)
        if value_start then
          vim.api.nvim_buf_set_extmark(buf, frontmatter_ns, i - 1, value_start - 1, {
            end_col = #line,
            hl_group = "MarkdownFrontmatterValue",
            priority = 200,
          })
        end
      end
    end
  end
end

vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function(args)
    vim.api.nvim_set_hl(0, "@markup.heading.1.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.2.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.3.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.4.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.5.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.6.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.heading.marker.markdown", { fg = "#78ccf0", bold = true })
    vim.api.nvim_set_hl(0, "@markup.strong.markdown_inline", { fg = "#ffcb6b", bold = true })
    vim.api.nvim_set_hl(0, "@markup.italic.markdown_inline", { fg = "#c792ea", italic = true })
    vim.api.nvim_set_hl(0, "@markup.raw.markdown_inline", { fg = "#f1e655" })
    vim.api.nvim_set_hl(0, "@markup.raw.block.markdown", { fg = "#f1e655" })
    vim.api.nvim_set_hl(0, "@markup.link.markdown_inline", { fg = "#ff5370" })
    vim.api.nvim_set_hl(0, "@markup.link.label.markdown_inline", { fg = "#ff5370" })
    vim.api.nvim_set_hl(0, "@markup.link.url.markdown_inline", { fg = "#F77669" })
    vim.api.nvim_set_hl(0, "@markup.list.markdown", { fg = "#ff5370" })
    vim.api.nvim_set_hl(0, "@markup.quote.markdown", { fg = "#F77669" })

    highlight_frontmatter(args.buf)

    if vim.b[args.buf].frontmatter_autocmd then return end
    vim.b[args.buf].frontmatter_autocmd = true

    vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
      buffer = args.buf,
      callback = function()
        highlight_frontmatter(args.buf)
      end,
    })
  end,
})
