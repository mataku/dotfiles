# task-timeline

A Claude Code mod (function hooks) that lets the agent keep a weighted task plan and shows it, with a progress bar, in a pane beside the transcript, so you can see what it is working on and how far the whole job has come.

## Behavior

- The agent gets two tools, listed from the first request:
  - `plan_set` records a title and a task tree, replacing any earlier plan. A task has a `title` and optionally an `id`, a `weight`, a `status`, a `note` and `children` (up to 4 levels, 200 tasks in all).
  - `plan_update` changes tasks by id (`status`, `note`, `title`) and appends tasks at the top level or under a parent.
- A status is one of `pending`, `in_progress`, `done` and `blocked`. Only tasks without subtasks carry one; a status set on a task with subtasks applies to its subtasks, and a parent shows the status its subtasks add up to.
- The pane opens when a plan is recorded and closes when the plan goes:

  ```
  Ship timeline
  ██████████░░░░░░░░░░ 50% 2/4
  ✓ Research
  ● Build
    ✓ Tree
    ● Bar
  ○ CI
  ```

- Progress follows weights. A weight compares a task with its siblings, and subtasks divide their parent's share, so splitting a task into subtasks leaves its share unchanged. A finished task of weight 3 beside an unstarted one of weight 1 is 75%. Only finished tasks count; the figure after the percentage is finished tasks over all tasks without subtasks.
- A blocked or in-progress task shows its note in the pane. `/timeline` prints the whole tree with ids, weights and every note.
- A finished plan stays until you send your next prompt, then leaves with its pane.
- If you close the pane, it stays closed until `/timeline` or the next `plan_set`.
- `/timeline clear` drops the plan.
- When the plan has unfinished tasks and the agent makes 24 tool calls without updating it, the mod adds a reminder after the next tool result. Set **Task update reminder** (`nudgeAfter`) to change the count; 0 turns the reminder off.
- Subagents cannot call either tool: the main agent owns the plan and records what they report.
- In a herdr-core terminal (`HC_TERMINAL_ID` is set) the plan is also written to a file for the herdr.app `timeline` mod (`herdr-app/mods/timeline` in this repository), which draws it in a panel on the right of the window. There the pane opens only when you run `/timeline`.
- In an Orca terminal (`ORCA_TERMINAL_HANDLE` is set) the plan is written to the same kind of file for the Orca `timeline` plugin (`orca/plugins/timeline` in this repository). In an Orca chat, which has no terminal (`ORCA_AGENT_SESSION_ID` is set), the file is named after the session id instead. The pane opens as usual in both, because an Orca panel opens only by hand.

## Data

- The plan lives in `$.state` for the session and is copied to `$.store` under the session id, so a restarted or resumed session with the same id gets its plan back. Stored plans older than 30 days are removed at session start.
- Text from the agent is drawn in the terminal, so control characters and bidi overrides are replaced with spaces before a title, an id or a note is kept.
- In a herdr-core or Orca terminal the mod writes `~/.local/state/agent-timeline/<terminal id>.json` on every change (`<session id>.json` in an Orca chat, with the session id as `terminal`): `{ version, terminal, agent, updatedAt, plan }`, where `plan` holds the title, the percentage, the task counts and the tree with each task's status and its share of the whole, or `null` once the plan is gone or the session has ended. A terminal id that is not a plain name writes nothing.
- Apart from that file the mod touches nothing outside `$.state` and `$.store`: no processes or network. It reads `HC_TERMINAL_ID`, `ORCA_TERMINAL_HANDLE`, `ORCA_AGENT_SESSION_ID` and `HOME`.

## Limitations

- The plan is only as current as the agent keeps it; the reminder is the one nudge.
- A session resumed inside a running process (`/resume`) does not bring that session's stored plan back until the next start.
- One plan per session.
- The pane docks beside the transcript only in the fullscreen layout; elsewhere it sits inline above the prompt.
- A pane opened by the agent's `plan_set` is placed from 144 terminal columns; in a narrower terminal it waits until you run `/timeline`.
- The stored copy of a plan is plain JSON in the plugin store, kept for up to 30 days; do not put secrets in task titles or notes.
- A failed write to the store is ignored: the plan stays for the session and is not restored after a restart.
- The plan file is plain JSON and is never deleted, only emptied. A failed write is ignored. A session that is killed leaves its last plan in the file until the next session starts in that terminal.

## Development

```sh
claude plugin validate claude/mods/task-timeline
claude plugin test claude/mods/task-timeline
```

## License

MIT
