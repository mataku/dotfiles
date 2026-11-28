const ANDROID_CLI = "/opt/homebrew/bin/android";
const UDID = /^[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/;
const SERIAL = /^emulator-\d{4,5}$/;
const AVD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TTY = /^\/dev\/ttys\d{1,4}$/;
const IOS_RUNTIME = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)$/;
const EMULATOR_HEADER = /^AVD ID\s{2,}/;
const COLUMN_GAP = /\s{2,}/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;
const ANDROID_GROUP = "android";
// nikol stops a program after 120 s at most, so a slower boot ends as a timeout while the device keeps booting.
const BOOT_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 60_000;
const LIST_TIMEOUT_MS = 20_000;
const MAX_NAME_LENGTH = 80;

// Shared with the herdr mod, which keeps the viewer and its node_modules; a copy inside this mod's folder would make nikol watch every file of node_modules.
export const VIEWER = "src/github.com/mataku/dotfiles/herdr-app/mods/simulators/viewer/viewer.js";
export const STREAM_KEYS = new Map([["home", "h"], ["lock", "l"], ["rotate", "r"]]);

const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
export const isUdid = (value) => matches(UDID, value);
export const isSerial = (value) => matches(SERIAL, value);
export const isAvdId = (value) => matches(AVD_ID, value);
export const isTty = (value) => matches(TTY, value);

export function displayName(name) {
  const text = typeof name === "string" ? name.replace(CONTROL_CHARACTERS, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  return text === "" ? "Unnamed" : text;
}

export function parseSimulators(text) {
  let runtimes;
  try {
    runtimes = JSON.parse(text)?.devices;
  } catch {
    return [];
  }
  if (typeof runtimes !== "object" || runtimes === null) return [];
  const devices = [];
  for (const [runtime, list] of Object.entries(runtimes)) {
    const version = IOS_RUNTIME.exec(runtime)?.slice(1).map(Number);
    if (!version || !Array.isArray(list)) continue;
    for (const raw of list) {
      if (!isUdid(raw?.udid) || raw.isAvailable === false) continue;
      devices.push({
        key: `ios:${raw.udid}`,
        kind: "ios",
        id: raw.udid,
        name: typeof raw.name === "string" ? raw.name : "Simulator",
        running: raw.state === "Booted",
        runtime: `iOS ${version.join(".")}`,
        version,
        lastUsedAt: Date.parse(raw.lastUsedAt) || 0,
      });
    }
  }
  return devices;
}

export function parseEmulators(text) {
  if (typeof text !== "string") return [];
  const lines = text.split("\n");
  const header = lines.findIndex((line) => EMULATOR_HEADER.test(line));
  if (header < 0) return [];
  const devices = [];
  for (const line of lines.slice(header + 1)) {
    const [id, name, , status, serial] = line.trim().split(COLUMN_GAP);
    if (!isAvdId(id) || status === undefined) continue;
    const running = status === "Online" && isSerial(serial);
    devices.push({ key: `android:${id}`, kind: "android", id, name: name ?? id, running, serial: running ? serial : null });
  }
  return devices;
}

const byUse = (a, b) =>
  Number(b.running) - Number(a.running) || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);

export function groupDevices(emulators, simulators) {
  const runtimes = new Map();
  for (const device of simulators) {
    if (!runtimes.has(device.runtime)) runtimes.set(device.runtime, { key: device.runtime, title: device.runtime, version: device.version, devices: [] });
    runtimes.get(device.runtime).devices.push(device);
  }
  const iosGroups = [...runtimes.values()].sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1]);
  const groups = [
    { key: ANDROID_GROUP, title: "Android", devices: [...emulators], opensByDefault: true },
    ...iosGroups.map(({ version: _version, ...group }, index) => ({ ...group, opensByDefault: index === 0 })),
  ];
  return groups.filter((group) => group.devices.length > 0).map((group) => ({ ...group, devices: group.devices.sort(byUse) }));
}

export function isOpen(group, folds) {
  return folds.get(group.key) ?? (group.opensByDefault || group.devices.some((device) => device.running));
}

export function rowsOf(groups, folds) {
  return groups.flatMap((group) => {
    const open = isOpen(group, folds);
    return [{ group, open }, ...(open ? group.devices.map((device) => ({ device })) : [])];
  });
}

const targetOf = (device) => {
  if (device?.kind === "ios" && isUdid(device.id)) return "ios";
  if (device?.kind === "android" && isAvdId(device.id)) return "android";
  return null;
};

export function bootCommand(device) {
  switch (targetOf(device)) {
    case "ios": return { command: "xcrun", args: ["simctl", "bootstatus", device.id, "-b"], timeout: BOOT_TIMEOUT_MS };
    case "android": return { command: ANDROID_CLI, args: ["emulator", "start", "--headless", device.id], timeout: BOOT_TIMEOUT_MS };
    default: return null;
  }
}

export function stopCommand(device) {
  switch (targetOf(device)) {
    case "ios": return { command: "xcrun", args: ["simctl", "shutdown", device.id], timeout: STOP_TIMEOUT_MS };
    case "android": return { command: ANDROID_CLI, args: ["emulator", "stop", device.id], timeout: STOP_TIMEOUT_MS };
    default: return null;
  }
}

export const VIEWER_LOG = "Library/Logs/nikol/simulators-viewer.log";

// Why through sh: the viewer's path and its log are under the home folder, which only the shell knows, and the values stay arguments, never shell text.
// Why a log file: nikol keeps a program's output only until it ends, and the viewer runs for as long as the screen shows.
export function viewerCommand(device, tty) {
  const kind = targetOf(device);
  const id = kind === "android" ? device.serial : device?.id;
  if (kind === null || !isTty(tty) || (kind === "android" && !isSerial(id))) return null;
  const script = 'log="$HOME/$1"; mkdir -p "$(dirname "$log")"; shift; exec node "$HOME/$0" "$@" >>"$log" 2>&1';
  return { command: "sh", args: ["-c", script, VIEWER, VIEWER_LOG, kind, id, tty] };
}

export function readFolds(value) {
  return new Map(Array.isArray(value) ? value.filter((entry) => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "boolean") : []);
}

export function failureOf(result) {
  if (result.error === "stopped") return null;
  if (result.error) return result.error === "not-found" ? "the tool is not installed" : result.error;
  if (result.code !== 0) return result.stderr.trim().split("\n").at(-1) || `exited with ${result.code}`;
  return null;
}

const FOLDS_FILE = "folds.json";
const ADB_STOP = "adb-stop";
const SCREEN = "screen";
const VIEWER_ID = "viewer";

const parsed = (text) => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export function createSimulators(nikol) {
  const { ui } = nikol;
  const model = {
    simulators: [],
    emulators: [],
    loaded: false,
    listing: 0,
    reloadAgain: false,
    busy: new Map(),
    errors: new Map(),
    folds: new Map(),
    screen: null,
    opening: null,
    shown: false,
    notice: null,
  };
  let tree = null;

  const devices = () => [...model.emulators, ...model.simulators];
  const find = (key) => devices().find((device) => device.key === key) ?? null;

  function reload() {
    if (model.listing > 0) {
      model.reloadAgain = true;
      return;
    }
    model.listing = 2;
    nikol.exec("list:ios", "xcrun", ["simctl", "list", "devices", "-j"], { timeout: LIST_TIMEOUT_MS });
    nikol.exec("list:android", ANDROID_CLI, ["emulator", "list", "--long"], { timeout: LIST_TIMEOUT_MS });
  }

  // Why stop the adb server: the Android CLI starts one that outlives nikol, and macOS then keeps nikol in the Dock as running in the background. The CLI starts it again when it needs it.
  function releaseAdb() {
    if (model.screen?.kind === "android") return;
    nikol.exec(ADB_STOP, "adb", ["kill-server"], { timeout: STOP_TIMEOUT_MS });
  }

  function listed(kind, result) {
    const ok = result.error === null && result.code === 0;
    if (kind === "ios") model.simulators = ok ? parseSimulators(result.stdout) : [];
    else model.emulators = ok ? parseEmulators(result.stdout) : [];
    model.listing = Math.max(0, model.listing - 1);
    if (kind === "android") releaseAdb();
    if (model.listing > 0) return;
    model.loaded = true;
    if (model.reloadAgain) {
      model.reloadAgain = false;
      reload();
      return;
    }
    const waiting = model.opening && find(model.opening);
    if (model.opening && !model.busy.has(model.opening)) {
      model.opening = null;
      if (waiting?.running && model.shown) openScreen(waiting);
      else if (waiting && !waiting.running) model.errors.set(waiting.key, "it did not come up");
    }
  }

  function run(device, label, command, id) {
    if (!command || model.busy.has(device.key)) return false;
    model.busy.set(device.key, label);
    model.errors.delete(device.key);
    nikol.exec(`${id}:${device.key}`, command.command, command.args, { timeout: command.timeout });
    return true;
  }

  function boot(device) {
    if (run(device, "Booting", bootCommand(device), "boot")) model.opening = device.key;
  }

  function stop(device) {
    if (model.screen?.key === device.key) leaveScreen();
    run(device, "Stopping", stopCommand(device), "stop");
  }

  function acted(id, result) {
    const [action, ...rest] = id.split(":");
    const key = rest.join(":");
    model.busy.delete(key);
    if (key.startsWith("android:")) releaseAdb();
    const failure = failureOf(result);
    if (failure !== null) {
      model.errors.set(key, failure);
      if (action === "boot" && model.opening === key) model.opening = null;
    }
    reload();
  }

  function openScreen(device) {
    if (!viewerCommand(device, "/dev/ttys000")) return;
    model.notice = null;
    model.screen = { key: device.key, kind: device.kind, id: device.id, serial: device.serial ?? null, name: displayName(device.name), started: false };
  }

  function terminalStarted(id, tty) {
    const screen = model.screen;
    if (id !== SCREEN || !screen || screen.started) return;
    const command = viewerCommand(screen, tty);
    if (!command) return;
    screen.started = true;
    nikol.exec(VIEWER_ID, command.command, command.args, { timeout: 0, input: true });
  }

  function viewerEnded(result) {
    const screen = model.screen;
    if (!screen || result.error === "stopped") return;
    model.screen = null;
    model.notice = `The screen of ${screen.name} closed${failureOf(result) ? `: ${failureOf(result)}` : ""}`;
    reload();
  }

  // Why going back shuts the device down: it was opened for its screen, and without the screen nothing shows that it still runs.
  function leaveScreen({ shutDown = false } = {}) {
    const screen = model.screen;
    if (!screen) return;
    model.screen = null;
    nikol.exec.stop(VIEWER_ID);
    const device = find(screen.key) ?? screen;
    if (shutDown) run(device, "Stopping", stopCommand(device), "stop");
  }

  function toggleFold(key) {
    const group = groupDevices(model.emulators, model.simulators).find((candidate) => candidate.key === key);
    if (!group) return;
    model.folds.set(key, !isOpen(group, model.folds));
    nikol.data.write(FOLDS_FILE, JSON.stringify([...model.folds]));
  }

  function onClick(id) {
    if (id === "reload") reload();
    else if (id === "back") leaveScreen({ shutDown: true });
    else if (STREAM_KEYS.has(id)) nikol.exec.write(VIEWER_ID, STREAM_KEYS.get(id));
    else if (id.startsWith("fold:")) toggleFold(id.slice(5));
    else if (id.startsWith("act:")) {
      const device = find(id.slice(4));
      if (device) device.running ? stop(device) : boot(device);
    } else if (id.startsWith("row:")) {
      const device = find(id.slice(4));
      if (device?.running && !model.busy.has(device.key)) openScreen(device);
    }
  }

  const iconButton = (id, icon, tooltip, size = 14) => ui.button(id, [ui.row([ui.icon(icon, { size, color: "dim" })], { padding: 5 })], { tooltip });
  const textButton = (id, label) => ui.button(id, [ui.row([ui.text(label, { style: "dim", grow: false })], { padding: 5 })]);

  function deviceRow(device) {
    const busy = model.busy.get(device.key);
    const error = model.errors.get(device.key);
    const control = busy
      ? ui.row([ui.text(busy, { style: "dim", grow: false }), ui.spinner({ size: 12 })], { gap: 6 })
      : iconButton(`act:${device.key}`, device.running ? "icons/stop.svg" : "icons/play.svg", device.running ? "Stop" : "Boot", 11);
    return ui.button(
      `row:${device.key}`,
      [
        ui.row(
          [
            ui.spacer(16),
            ui.dot(device.running ? "status.inProgress" : "status.pending", { size: 7 }),
            ui.column([
              ui.text(displayName(device.name), { maxLines: 1, color: device.running ? "fg" : "dim" }),
              ...(error ? [ui.text(error, { style: "dim", color: "status.blocked", maxLines: 2 })] : []),
            ]),
            control,
          ],
          { gap: 8, height: error ? 0 : 30, padding: 2 },
        ),
      ],
      { tooltip: device.running && !busy ? "Show the screen" : undefined },
    );
  }

  function groupRow(group, open) {
    const running = group.devices.filter((device) => device.running).length;
    return ui.button(`fold:${group.key}`, [
      ui.row(
        [
          ui.text(open ? "▾" : "▸", { style: "dim", width: 12 }),
          ui.text(group.title, { style: "dim", maxLines: 1 }),
          ui.text(running > 0 ? `${running} running · ${group.devices.length}` : String(group.devices.length), { style: "dim", grow: false }),
        ],
        { gap: 6, height: 28, padding: 2 },
      ),
    ]);
  }

  function listView() {
    const rows = rowsOf(groupDevices(model.emulators, model.simulators), model.folds);
    const header = ui.row(
      [
        ui.text(model.notice ?? "", { style: "dim", maxLines: 2 }),
        model.listing > 0 ? ui.row([ui.spinner({ size: 14, color: "dim" })], { padding: 5 }) : iconButton("reload", "icons/reload.svg", "Reload"),
      ],
      { gap: 8, height: 32 },
    );
    const body = rows.length === 0
      ? [ui.text(model.loaded ? "No simulators or emulators found" : "Looking for devices…", { style: "dim" })]
      : [ui.scroll(rows.map((row) => (row.device ? deviceRow(row.device) : groupRow(row.group, row.open))), { gap: 1 })];
    return ui.column([header, ui.divider(), ...body], { gap: 6 });
  }

  function screenView() {
    const bar = ui.row(
      [
        textButton("back", "‹ Simulators"),
        ui.text(model.screen.name, { maxLines: 1 }),
        textButton("home", "Home"),
        textButton("lock", "Lock"),
        textButton("rotate", "Rotate"),
      ],
      { gap: 4, height: 32 },
    );
    return ui.column([bar, ui.divider(), ui.terminal(SCREEN)], { gap: 4 });
  }

  const redraw = () => {
    tree = model.screen ? screenView() : listView();
  };

  return {
    model,
    start() {
      model.folds = readFolds(parsed(nikol.data.read(FOLDS_FILE)));
      redraw();
    },
    event(name, payload) {
      if (name === "shown") {
        model.shown = true;
        if (!model.loaded) reload();
      } else if (name === "hidden") {
        model.shown = false;
        leaveScreen({ shutDown: true });
      } else if (name === "terminal") {
        terminalStarted(payload.id, payload.tty);
      } else if (name === "exec") {
        if (payload.id === "list:ios") listed("ios", payload);
        else if (payload.id === "list:android") listed("android", payload);
        else if (payload.id === VIEWER_ID) viewerEnded(payload);
        else if (payload.id.startsWith("boot:") || payload.id.startsWith("stop:")) acted(payload.id, payload);
      } else if (name === "click") {
        onClick(payload.id);
      }
      redraw();
    },
    render() {
      return tree;
    },
  };
}

if (globalThis.nikol?.exec) globalThis.nikol.register(createSimulators(globalThis.nikol));
