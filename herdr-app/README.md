# herdr-app

Configuration and mods for the Herdr desktop app. `mise bootstrap` links the files listed in the repository's `mise.toml` into `~/.config/herdr-app/`.

## Mods

### inbox

Unread GitHub notifications in a side panel. Off by default; the switch is in the panel.

![inbox](./misc/inbox.png)

### markdown-preview

A local Markdown file rendered in a pane. `cmd-shift-m` picks the file.

![markdown](./misc/markdown.png)

### containers

Docker containers in a popup, grouped by Compose project, with CPU, memory and ports, and a button to start or stop each. `cmd-shift-c` opens it; it reads `docker` every 30 seconds while it is open and never while it is closed.

### simulators

iOS simulators and Android emulators, with the running device's screen in a side panel.

![simulator](./misc/simulator.png)

### timeline

The task plan of the agents in the shown space, with their progress.

![timeline](./misc/timeline.png)

### status-hints

A cheat sheet at the bottom of the window for the keys I use most: previous and next space, jump to the waiting agent, open a Markdown file, open the containers popup, and the command palette.

## Working on a mod

- Read [`mods/DESIGN.md`](./mods/DESIGN.md) first: the mods cannot share code, so the parts they have in common are written down there.
- After editing a mod, run `touch -h ~/.config/herdr-app/mods/<name>/main.js`: Herdr watches the link, not the file it points to.
- Test with `node --test herdr-app/mods/*/*.test.js` and load-check with `herdr-app check ~/.config/herdr-app/mods/<name>`.
- A new mod needs its links in `mise.toml` and its assertions in `.github/workflows/provisioning.yml`.
