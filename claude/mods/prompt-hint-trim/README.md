# prompt-hint-trim

A Claude Code mod (function hooks) that drops low-value parts from the footer line under the prompt (`PromptHint`).

## Behavior

- The footer text is split on ` · ` and the following parts are removed:
  - `N shell` / `N shells`: the background-jobs-band mod already shows the same information above the prompt.
  - `← for agents`: a reminder of a key binding. The ← key itself still works.
- Only parts that match exactly are removed. For example, `2 shells running elsewhere` is kept.
- When nothing is removed, the engine's own line is drawn unchanged, so its colors and links stay.
- When something is removed, the whole line is replaced with the remaining text, because the footer has no per-part API. If every part is removed, the line is empty.
- `auto mode on` is drawn by a separate component and is not affected.

## Development

```sh
claude plugin validate claude/mods/prompt-hint-trim
claude plugin test claude/mods/prompt-hint-trim
```

## License

MIT
