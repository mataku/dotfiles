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

### inbox

Unread GitHub notifications beside the terminal, opened from the Inbox button in the tab bar. It is the herdr.app mod `herdr-app/mods/inbox` moved to nikol's side slot, with its SVG icons copied as they are.

- It is off until turned on; while on, it runs in the background (`"side": { "background": true }`), loads `gh api notifications` every 5 minutes after `scutil --nwi` says the network is up, and puts a dot on its button while anything waits.
- A click on a row copies the notification's link; Done hides it until it is updated. The on/off switch, the last load and the done marks are kept with nikol's `data` API in `~/Library/Application Support/nikol/mod-data/inbox/`.

Test it with `node --test nikol/mods/inbox/main.test.js`.

### simulators

iOS simulators and Android emulators beside the terminal, opened from the Simulator button in the tab bar: boot and stop them, and show a running one's screen in the panel, where clicks and drags become taps and swipes. It is the herdr.app mod `herdr-app/mods/simulators` moved to nikol's side slot.

- The screen is drawn by the herdr mod's viewer (`herdr-app/mods/simulators/viewer`), which nikol runs with `exec` and hands the tty of a `ui.terminal`; it is not copied here, since nikol would watch every file of its `node_modules`. Its log goes to `~/Library/Logs/nikol/simulators-viewer.log`.
- Going back to the list or closing the panel stops the viewer and shuts the device down. A boot waits 120 seconds at most, nikol's limit for a program.
- It stops the adb server after each Android CLI run, unless an Android screen is shown, since the server outlives nikol and keeps it in the Dock as running in the background.

Test it with `node --test nikol/mods/simulators/main.test.js`.
