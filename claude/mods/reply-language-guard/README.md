# reply-language-guard

A Claude Code mod (function hooks) that sends the main session back when its final reply is written mostly in English, asking it to rewrite the English parts in Japanese.

## Behavior

- Hooks `classic.Stop` and judges only `last_assistant_message`; the transcript is not read.
- Before counting, fenced code blocks, inline code, Markdown links, bare URLs and email addresses are removed, because showing English commands or drafts inside code is legitimate.
- A reply is mostly English when it has at least 30 Latin letters and more than three times as many Latin letters as Japanese characters (hiragana, katakana including `ー`, kanji).
- On an English reply the hook returns `{ block }` with a Japanese reason that quotes the reply's first line (up to 80 characters) and asks for the whole reply in Japanese, because the English reply is hidden and any Japanese parts in it would be lost otherwise.
- The sent-back reply is recorded in `$.state`, and an `AssistantMessage` render hook draws an empty Box for every reply block contained in a recorded reply. Only the drawing changes: the stored message, ctrl+o and `/copy` keep the English text. The record lives for the session only, so a resumed session shows the English reply again. While the reply is streaming it is still visible; it disappears when the turn is sent back.
- It passes the reply through when:
  - `stop_hook_active` is set, so a turn is sent back at most once and an English rewrite cannot loop.
  - The stop belongs to a subagent (`agent_id` is set).
  - The reply is a JSON object or array, optionally in a `json` fence, because a send-back would corrupt machine-read output.
- An `AskUserQuestion` call whose question, headers, option labels and descriptions are mostly English is denied before the dialog is shown, asking for the question in Japanese. Previews are not counted, so English text to choose from can go there. At most one question is denied per main-loop turn (reset on `turn.start` without `agentId`), so an English rewrite is shown rather than denied again.
- Sending back costs one more model response for the rewrite; detection itself makes no model call.

## Development

```sh
claude plugin validate claude/mods/reply-language-guard
claude plugin test claude/mods/reply-language-guard
```

## License

MIT
