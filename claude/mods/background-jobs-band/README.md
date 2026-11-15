# background-jobs-band

A Claude Code mod (function hooks) that lists background subagents and background shells in the band above the prompt (`AbovePrompt`), so you can see what is running and what just finished without opening the tasks list.

## Behavior

- One row per job:

  ```
  ⏵ Explore  search auth flow · 14 tools (Grep) · 1m23s
  ⏵ $ ./gradlew testDebugUnitTest · 3m10s
  ✓ general-purpose  update README · done 2m ago
  ✗ $ npm test · exit 1 · 5m ago
  ```

- Running rows show the kind (the agent type for a subagent, `$` and the command for a shell), the description and the elapsed time. Subagent rows also show the number of tool calls and the latest tool.
- Finished rows show `✓` on success and `✗` on failure or kill, with the time since they ended. They are dimmed, and only the `✗` is red.
- A finished row is removed when the person submits the next prompt, or at the first redraw 5 minutes after it ended (the minute tick, so up to a minute later), whichever comes first.
- Elapsed time is shown as `45s`, `3m10s` or `1h05m`, and the time since a job ended in minutes. While a job is shown, the band is redrawn once a minute and whenever a job changes, so the seconds are exact only at each redraw.
- The description is cut with `…` to fit the band width (`bodyColumns`).
- When there is nothing to show, or a survey holds the band, the mod passes and the band is not drawn.

## Data sources

- Subagents and teammates: `agent.spawn` adds a background subagent immediately and remembers foreground ones so they are not listed; an Agent call that later reports `async_launched` (moved to the background) is listed from then on. `$.agent.list()` is read once at session start, to pick up agents already running, and then polled every 3 seconds only while a listed subagent is running. Status changes are diffed: `completed` is a success, `failed` and `killed` are failures, and any other status counts as still running. While no subagent runs, `$.agent.list()` is not polled; the one-minute redraw tick is the only timer left. An idle teammate counts as running, so the poll goes on for as long as a teammate lives.
- Subagent progress: `tool.call` events carrying the subagent's `agentId` are counted in memory and added to the row at the next poll, so the count is up to 3 seconds behind.
- Background shells: a main-loop `Bash` call whose result carries `backgroundTaskId` (`run_in_background`, Ctrl+B, or an auto-backgrounded timeout).
- Shell completion: the background task notification (a `prompt.submit` with origin `task-notification`), parsed for `<task-id>`, `<status>` and the exit code in `<summary>`. A `TaskStop` call marks its task as killed.

## Limitations

- Background shells started inside a subagent are not tracked, because their notifications go to the subagent rather than to the main session.
- The notification text has no structured API; if its format changes, finished shells stay listed as running until the session ends (a `TaskStop` still ends them).
- Workflows and monitors are not shown.
- An agent that starts without an `agent.spawn` this mod hears (one spawned from inside another hook's own spawn) is not listed until the next session start.

## Development

```sh
claude plugin validate claude/mods/background-jobs-band
claude plugin test claude/mods/background-jobs-band
```

## License

MIT
