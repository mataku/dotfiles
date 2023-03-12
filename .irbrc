require 'irb/completion'
require 'irb/ext/save-history'
require 'irb/completion'
require 'interactive_editor'
require 'awesome_print'

IRB.conf[:SAVE_HISTORY] = 10000
IRB.conf[:HISTORY_FILE] = File.expand_path('~/.irb_history')
