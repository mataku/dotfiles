-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

-- Make sure to setup `mapleader` and `maplocalleader` before
-- loading lazy.nvim so that mappings are correct.
-- This is also a good place to setup other settings (vim.opt)
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- Setup lazy.nvim
require("lazy").setup({
  spec = {
    {
      "NLKNguyen/papercolor-theme",
      config = function()
        vim.cmd[[ colorscheme PaperColor ]]
      end,
    },
    {
      "hrsh7th/cmp-nvim-lsp"
    },
    {
      "hrsh7th/cmp-buffer"
    },
    {
      "hrsh7th/cmp-path"
    },
    {
      "hrsh7th/nvim-cmp",
      event = "InsertEnter",
      dependencies = {
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-path"
      },
      config = function()
        local cmp = require('cmp')
        cmp.setup({
          window = {
          },
          sources = {
            { name = "nvim_lsp" },
            { name = "buffer" },
            { name = "path" },
          },
          mapping = cmp.mapping.preset.insert({
            ["<Tab>"] = cmp.mapping(function(fallback)
              if cmp.visible() then
                  cmp.select_next_item()
              else
                  fallback()
              end
            end, {
              "i",
              "s",
              }
            ),
            ["<S-Tab>"] = cmp.mapping(function(fallback)
              if cmp.visible() then
                  cmp.select_prev_item()
              else
                  fallback()
              end
            end, {
              "i",
              "s",
              }
            ),
            ["<CR>"] = cmp.mapping.confirm {
                behavior = cmp.ConfirmBehavior.Insert,
                select = true,
            },
          })
        })
      end
    },
    {
      "neovim/nvim-lspconfig",
      dependencies = {
        "hrsh7th/cmp-nvim-lsp"
      },
      config = function()
        local lspconfig = require('lspconfig')
        local capabilities = require('cmp_nvim_lsp').default_capabilities()
        lspconfig.solargraph.setup{
          capabilities = capabilities
        }
      end
    },
    { "scrooloose/nerdtree" },
    { 
      "vim-scripts/ruby-matchit",
      ft = {
        "ruby"
      }
    },
    { "tpope/vim-endwise" },
    { "tomtom/tcomment_vim" },
    { "itchyny/lightline.vim" },
    { 
      "dag/vim-fish",
      ft = {
        "fish"
      }
    },
    {
      "junegunn/vim-emoji",
      ft = {
        "markdown",
        "gitcommit"
      }
    }

    -- import your plugins
    -- { import = "plugins" },
  },
  -- Configure any other settings here. See the documentation for more details.
  -- colorscheme that will be used when installing plugins.
  install = { colorscheme = { "habamax" } },
  -- automatically check for plugin updates
  checker = { enabled = false },
})
