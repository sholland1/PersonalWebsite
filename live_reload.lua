local browser = "firefox"

vim.keymap.set({'n', 'i'}, '<F5>', '<cmd>lua RegenerateProject()<cr>', { noremap = true, silent = true })
vim.keymap.set({'n', 'i'}, '<C-F5>', '<cmd>lua ViewHtmlFile()<cr>', { noremap = true, silent = true })

local function OpenInBrowser(filename)
  os.execute(string.format("%s 'file://%s'", browser, filename))
end

local function SwitchToBrowser()
  os.execute(string.format("xdotool search --class %s windowactivate &", browser))
end

local function RefreshBrowser()
  os.execute(string.format("xdotool search --class %s key F5 &", browser))
end

function RegenerateProject()
  vim.api.nvim_command('silent! write')
  local cmd_output = vim.fn.system("run")
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_err_writeln(cmd_output)
    return
  end
  RefreshBrowser()
end

function ViewHtmlFile()
  OpenInBrowser(vim.fn.expand("%:p"))
  SwitchToBrowser()
end

--local function HardRefreshBrowser()
--  os.execute(string.format("xdotool search --class %s key Ctrl+F5 &", browser))
--end
--
-- --@diagnostic disable: undefined-global
-- vim.api.nvim_create_autocmd("BufWritePost", {
--   pattern = "*.css",
--   group = vim.api.nvim_create_augroup("ExecuteOnSave", { clear = true }),
--   callback = HardRefreshBrowser,
-- })
--
-- vim.api.nvim_create_autocmd({"TextChanged", "InsertLeave"}, {
--   pattern = "*.html",
--   group = vim.api.nvim_create_augroup("AutoSave", { clear = true }),
--   callback = function()
--     if vim.bo.modified and not vim.bo.readonly and vim.fn.expand("%") ~= "" then
--       vim.api.nvim_command('silent! write')
--       RefreshBrowser()
--     end
--   end,
-- })
