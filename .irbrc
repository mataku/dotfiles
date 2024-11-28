require 'irb/completion'
require 'irb/ext/eval_history'
require 'irb/completion'
begin
  require 'interactive_editor'
  require 'awesome_print'
rescue LoadError
end

IRB.conf[:SAVE_HISTORY] = 10000
IRB.conf[:HISTORY_FILE] = File.expand_path('~/.irb_history')
