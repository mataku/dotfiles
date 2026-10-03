# background-jobs-band

A Claude Code mod (function hooks) that lists background subagents and background shells in the band above the prompt (`AbovePrompt`), so you can see what is running and what just finished without opening the tasks list.

## Behavior

- One row per job:

  ```
  ⏵ Explore  search auth flow · 14 tools (Grep) · 1m
  ⏵ $ ./gradlew testDebugUnitTest · 3m
  ✓ general-purpose  update README · done 2m ago
  ✗ $ npm test · exit 1 · 5m ago
  ```

- Running rows show the kind (the agent type for a subagent, `$` and the command for a shell), the description and the elapsed time. Subagent rows also show the number of tool calls and the latest tool.
- Finished rows show `✓` on success and `✗` on failure or kill, with the time since they ended. They are dimmed, and only the `✗` is red.
- A finished row is removed when the person submits the next prompt or 5 minutes after it ended, whichever comes first.
- Times are shown at minute granularity (`<1m`, `3m`, `1h05m`) and redrawn about once a minute.
- The description is cut with `…` to fit the band width (`bodyColumns`).
- When there is nothing to show, or a survey holds the band, the mod passes and the band is not drawn.

## Data sources

- Subagents and teammates: `$.agent.list()` is polled every 3 seconds and status changes (`running`, `completed`, `failed`, `killed`, ...) are diffed. `agent.spawn` adds a background subagent immediately and remembers foreground ones so they are not listed; an Agent call that later reports `async_launched` (moved to the background) is listed from then on.
- Subagent progress: `tool.call` events carrying the subagent's `agentId` are counted.
- Background shells: a main-loop `Bash` call whose result carries `backgroundTaskId` (`run_in_background`, Ctrl+B, or an auto-backgrounded timeout).
- Shell completion: the background task notification (a `prompt.submit` with origin `task-notification`), parsed for `<task-id>`, `<status>` and the exit code in `<summary>`. A `TaskStop` call marks its task as killed.

## Limitations

- Background shells started inside a subagent are not tracked, because their notifications go to the subagent rather than to the main session.
- The notification text has no structured API; if its format changes, finished shells stay listed as running until the session ends (a `TaskStop` still ends them).
- Workflows and monitors are not shown.

## Development

```sh
claude plugin validate claude/mods/background-jobs-band
claude plugin test claude/mods/background-jobs-band
```

## License

MIT
