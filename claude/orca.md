# Orca

Rules for a session that runs inside Orca, as a chat or as a CLI in an Orca terminal. `~/.claude/CLAUDE.md` points here, and only such a session reads this file.

## Timeline panel

Applies only when the `plan_set` tool of the task-timeline mod is available.

- After the first `plan_set` of a session, run `orca plugin open local.timeline --panel timeline` once, so the plan shows in Orca's right sidebar.
- Do not run it again in the same session: the panel follows the plan by itself, and opening it again takes the sidebar away from whatever the user switched to.
- If the command fails (the plugin is not loaded, or no workspace is showing), carry on without mentioning it.
