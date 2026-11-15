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

## Data

- The plan lives in `$.state` for the session and is copied to `$.store` under the session id, so a restarted or resumed session with the same id gets its plan back. Stored plans older than 30 days are removed at session start.
- Text from the agent is drawn in the terminal, so control characters and bidi overrides are replaced with spaces before a title, an id or a note is kept.
- The mod reads and writes nothing outside `$.state` and `$.store`: no files, processes or network.

## Limitations

- The plan is only as current as the agent keeps it; the reminder is the one nudge.
- A session resumed inside a running process (`/resume`) does not bring that session's stored plan back until the next start.
- One plan per session.
- The pane docks beside the transcript only in the fullscreen layout; elsewhere it sits inline above the prompt.
- A pane opened by the agent's `plan_set` is placed from 144 terminal columns; in a narrower terminal it waits until you run `/timeline`.
- The stored copy of a plan is plain JSON in the plugin store, kept for up to 30 days; do not put secrets in task titles or notes.
- A failed write to the store is ignored: the plan stays for the session and is not restored after a restart.

## Development

```sh
claude plugin validate claude/mods/task-timeline
claude plugin test claude/mods/task-timeline
```

## License

MIT
