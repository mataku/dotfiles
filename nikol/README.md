# nikol

Mods for nikol. `mise bootstrap` links each mod folder listed in the repository's `mise.toml` into `~/.config/nikol/mods/`. nikol follows edits made inside a linked folder, so no step is needed after editing a mod.

## Mods

### timeline

The task plan of the coding agent in the shown tab, with its progress, in the panel on the right. The plan comes from the `task-timeline` Claude Code mod (`claude/mods/task-timeline`), which writes `~/.local/state/agent-timeline/<session id>.json` when it runs in nikol; this mod reads the file named after the session nikol reports for the shown tab.

- When the shown tab has no plan, it shows the first plan among the other tabs of the shown workspace, so that moving from the agent's tab to a shell tab does not close the panel and resize the terminal.
- It reads files only when the folder or the sessions to show change, not on every change of nikol's state, and returns the same tree while the file is unchanged, which lets nikol skip it.
- Only the first child of a task branches off its parent's line; the others hang from the child before them.

Test it with `node --test nikol/mods/timeline/main.test.js`.

### containers

A popup of the Docker containers, grouped by compose project, with their state, CPU, memory and ports; ↑↓ select, Enter starts or stops the selected one, `r` reads them again. It is the herdr.app mod `herdr-app/mods/containers` moved to nikol's API: `docker` runs through `exec`, and the polling loop became `exec` events and a 30-second `timer.after`.

- nikol opens it with the key set for "Open Containers" in Settings, Keyboard Shortcuts (⌘⇧C in herdr.app), which is stored in `~/.config/nikol/settings.json`.
- It reads the containers while the popup is open and stops when it closes, since nikol drops a popup mod on close.

Test it with `node --test nikol/mods/containers/main.test.js`.
