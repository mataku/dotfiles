require 'irb/completion'
require 'irb/ext/eval_history'
begin
  require 'interactive_editor'
  require 'awesome_print'
rescue LoadError
end

IRB.conf[:SAVE_HISTORY] = 10000
IRB.conf[:HISTORY_FILE] = File.expand_path('~/.irb_history')

Reline::Face.config(:completion_dialog) do |conf|
  conf.define :default, foreground: '#FFFFFF', background: '#78909C'
  conf.define :enhanced, foreground: '#FFFFFF', background: '#78909C'
  conf.define :scrollbar, foreground: '#FFFFFF', background: '#757575'
end
