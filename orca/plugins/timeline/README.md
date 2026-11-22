# Timeline

An Orca plugin: the task plan of the agents in the focused workspace, with their progress, in a right-sidebar panel. It is the Orca counterpart of the herdr.app `timeline` mod (`herdr-app/mods/timeline` in this repository).

## Behavior

- The panel shows the plan title, a progress bar, the finished and total task counts, and the task tree. A dot marks each task's status, and a line joins the tasks of one level; a task that is in progress or blocked shows its note.
- When several agents in the workspace have a plan, a list above the plan names them, and pressing one shows its plan.
- Without a plan the panel says so. It never opens or closes itself: open it from the right sidebar.

## Data

- The plans come from the `task-timeline` Claude Code mod (`claude/mods/task-timeline`), which writes `~/.local/state/agent-timeline/<terminal id>.json`. In Orca the terminal id is the terminal handle (`ORCA_TERMINAL_HANDLE`, such as `term_<uuid>`), the same id Orca gives a plugin as `terminalId`. An agent in Orca's Chat UI has no terminal, so its file is named after its session id, the `sessionId` Orca's `agents.list` gives a plugin for it.
- The worker (`src/worker.ts`) reads the files of the terminals and chat sessions the panel asks for and watches the folder. The panel (`src/panel.tsx`) asks again when the worker reports a change, when the focused workspace or its terminals change, and when an agent's status changes.
- The worker runs as a Node process with your account's access; it reads that folder and nothing else, and makes no network requests. The plugin asks for `workspace:read` and `agent:read`.

## Limitations

- A chat that starts a new session (`/clear`) gets a new session id, and the file of the old one stays in the folder, unread.
- Orca stops an idle worker, and its folder watch stops with it. Until the next workspace or agent event, the panel can lag behind the file.
- A session that is killed leaves its last plan in the file, and the panel keeps showing it.

## Development

```sh
orca plugin test .
orca plugin check .
orca plugin validate .
orca plugin dev watch .
```

`.ts` and `.tsx` files load as written, with no build step.
