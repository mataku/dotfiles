import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, hc, layout, nextCommand, notify, props, readTextFile, run, setShared, shared, terminals, theme } from "herdr";

const PANEL = "simulators-panel";
const LIST = "simulators-list";
const SCREEN = "simulators-screen";
const VIEW_BLOCK = "simulators-view";
const VIEW_TERMINAL = "simulators-view";
const STREAM_TERMINAL = "simulators-stream";

const ANDROID_CLI = "/opt/homebrew/bin/android";
const UDID = /^[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/;
const SERIAL = /^emulator-\d{4,5}$/;
const AVD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TTY = /^\/dev\/ttys\d{1,4}$/;
const IOS_RUNTIME = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)$/;
const EMULATOR_HEADER = /^AVD ID\s{2,}/;
const COLUMN_GAP = /\s{2,}/;
const TTY_NAME = /^ttys\d{1,4}$/;
const LAYOUT_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;
const ANDROID_GROUP = "android";
const BOOT_TIMEOUT_MS = 300_000;
const STOP_TIMEOUT_MS = 60_000;
const MAX_NAME_LENGTH = 80;

const SCREEN_KEY = "simulators.screen";
const STOPPING_KEY = "simulators.stopping";
const CHANGED_KEY = "simulators.changed";
const FOLDS_KEY = "folds";
const VIEWER_PATH = "mods/simulators/viewer/viewer.js";
const IDLE_FOREVER = ["/bin/sleep", "2147483647"];

const LIST_TIMEOUT_MS = 20_000;
const STREAM_APPEAR_MS = 5_000;
const STREAM_APPEAR_STEP_MS = 100;

const ICONS = { reload: "mods/simulators/icons/reload.svg", boot: "mods/simulators/icons/play.svg", stop: "mods/simulators/icons/stop.svg" };
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 90;
const STREAM_KEYS = new Map([["home", "h"], ["lock", "l"], ["rotate", "r"]]);

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

export function streamCommand({ device, viewer, tty }) {
  const kind = targetOf(device);
  const id = kind === "android" ? device.serial : device?.id;
  if (kind === null || !isTty(tty) || (kind === "android" && !isSerial(id))) return null;
  return ["run", "--json", "--bg", "--no-parent", "--rm", "--name", STREAM_TERMINAL, "--", "node", viewer, kind, id, tty];
}

export function ttyOf(psOutput) {
  const name = typeof psOutput === "string" ? psOutput.trim() : "";
  return TTY_NAME.test(name) ? `/dev/${name}` : null;
}

export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export const layoutFile = (home, name) => (matches(LAYOUT_NAME, name) ? `${home}/layouts/${name}.json` : null);

export function withViewBlock(tree) {
  if (findNode(tree, SCREEN) === null || findNode(tree, VIEW_BLOCK) !== null) return null;
  const restore = (node) => {
    const children = node.children?.map(restore);
    if (node.id !== SCREEN) return children ? { ...node, children } : node;
    return { ...node, children: [...(children ?? []), { id: VIEW_BLOCK, type: "block", content: { terminal: VIEW_TERMINAL } }] };
  };
  return restore(tree);
}

export function reconcileAction(panel, screen, streamAddress, fresh) {
  if (!panel.present) return { type: "none" };
  if (!screen) {
    const killStream = streamAddress !== null;
    const showList = panel.child === SCREEN;
    return killStream || showList ? { type: "tidy", killStream, showList } : { type: "none" };
  }
  // Why a screen without an address is left alone: it is being opened, and the task opening it clears it if that fails. One found at start has no such task.
  if (!screen.address && !fresh) return { type: "none" };
  const gone = streamAddress === null || streamAddress !== screen.address;
  if (!gone && panel.open) return { type: "none" };
  // Why a stream that ended by itself shuts nothing down: its device has usually gone already, and a viewer that crashed says nothing about the device.
  return { type: "leave", shutDown: !gone, announce: gone && panel.open && !fresh };
}

// Why the age check: the record is persisted, and one left behind by a quit must not keep a row busy for good.
export function stoppingKeyOf(record, now) {
  return record && now - record.at < STOP_TIMEOUT_MS ? record.key : null;
}

export function shouldLoad({ changed, seenChange, loaded, loading, reloadWanted, listVisible }) {
  return changed !== seenChange || (!loaded && !loading && !reloadWanted && listVisible);
}

export async function bootAndShow(device, { boot, find, listVisible, open, shutDown }) {
  await boot(device);
  const booted = find(device.key);
  if (!booted?.running) throw new Error("it did not come up");
  if (!listVisible()) return;
  try {
    await open(booted);
  } catch (error) {
    // Why it is shut down again: it was booted without a window, so without its screen in the panel nothing shows that it is running.
    await shutDown(booted).catch(() => {});
    throw new Error(`${error?.message ?? error}; it was shut down again`);
  }
}

// Why the work runs in a spawned task: a click handler's cx stops being valid when the handler returns, and booting outlives it by many seconds.
export function trackBusy(busy, key, label, cx, work, onError) {
  if (busy.has(key)) return false;
  busy.set(key, label);
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      await work(cx);
    } catch (error) {
      onError(error);
    } finally {
      busy.delete(key);
      cx.notify();
    }
  });
  return true;
}

export function panelOf(layout) {
  const panel = findNode(layout, PANEL);
  return { present: panel !== null, open: panel !== null && !panel.hidden, child: panel?.active ?? null };
}

const liveStream = () => terminals().find((terminal) => terminal.name === STREAM_TERMINAL && terminal.state === "live") ?? null;
const stopPress = (_event, cx) => cx.stop_propagation();

function leaveScreen({ shutDown = false } = {}) {
  const screen = shared(SCREEN_KEY);
  if (screen) setShared(SCREEN_KEY, null);
  const stream = liveStream();
  if (stream) run("terminal.kill", { terminal: stream.address });
  if (panelOf(layout()).child === SCREEN) run("layout.select", { stack: PANEL, child: LIST });
  if (!screen) return;
  if (shutDown) shutDownShown(screen);
  else setShared(CHANGED_KEY, Date.now());
}

// Why the list is told through shared state: this runs in the bar's or the button's copy of the mod, and only the list's copy holds the devices.
async function shutDownShown(screen) {
  const command = stopCommand(screen);
  if (!command) return;
  setShared(STOPPING_KEY, { key: screen.key, at: Date.now() });
  try {
    await exec(command.command, command.args, { timeout: command.timeout });
  } catch (error) {
    notify({ title: `Stopping ${screen.name} failed`, body: String(error?.message ?? error), level: "error" });
  } finally {
    setShared(STOPPING_KEY, null);
    setShared(CHANGED_KEY, Date.now());
  }
}

const stoppingKey = () => stoppingKeyOf(shared(STOPPING_KEY), Date.now());

async function viewTty() {
  const describe = async () => {
    const result = await hc(["get", VIEW_TERMINAL, "--json"]);
    const terminal = result.code === 0 ? JSON.parse(result.stdout) : null;
    return terminal?.state === "live" && Number.isInteger(terminal.pid) ? terminal : null;
  };
  let terminal = await describe();
  if (!terminal) {
    await hc(["run", "--json", "--bg", "--no-parent", "--name", VIEW_TERMINAL, "--", ...IDLE_FOREVER]);
    terminal = await describe();
  }
  if (!terminal) return null;
  const owner = await exec("/bin/ps", ["-o", "tty=", "-p", String(terminal.pid)]);
  return ttyOf(owner.stdout);
}

// Why this exists: Herdr deletes a terminal block from the layout file when its terminal ends (a core restart is enough), and the screen has nowhere to draw until the block is back.
async function restoreViewBlock() {
  if (findNode(layout(), VIEW_BLOCK)) return;
  const file = layoutFile(appHome(), shared("layout"));
  const restored = file && withViewBlock(JSON.parse((await readTextFile(file)) ?? "null"));
  if (!restored) throw new Error("the layout has no place for the device screen");
  run("layout.set", { layout: restored });
  // Why show the panel again: setting the layout also resets what was clicked open, this panel included.
  run("layout.show", { id: PANEL });
  notify({ title: "Restored the device screen", body: "Its terminal block was missing from the layout; panel sizes went back to the layout file's.", level: "info" });
}

async function listOf(command, args, parse) {
  try {
    const result = await exec(command, args, { timeout: LIST_TIMEOUT_MS });
    return result.code === 0 ? parse(result.stdout) : [];
  } catch {
    return [];
  }
}

function readFolds() {
  try {
    const entries = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? "[]");
    return new Map(entries.filter((entry) => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "boolean"));
  } catch {
    return new Map();
  }
}

export default class Simulators extends View {
  init(_props, cx) {
    this.role = props()?.button ? "button" : props()?.bar ? "bar" : "list";
    this.simulators = [];
    this.emulators = [];
    this.loaded = false;
    this.busy = new Map();
    this.folds = readFolds();
    this.cursor = null;
    this.opening = false;
    this.wake = null;
    this.loading = false;
    this.reloadWanted = false;
    this.seenChange = shared(CHANGED_KEY) ?? null;
    this.fresh = true;
    this.commands = this.commandsOf(this.role);
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        try {
          this.commands.get(command)?.(cx);
        } catch (error) {
          console.error(`simulators: ${command} failed`, error);
        }
        cx.notify();
      }
    });
    if (this.role === "list") cx.spawn((cx) => this.loadOnRequest(cx));
  }

  async close() {
    if (this.role !== "button" || checking()) return;
    const stream = liveStream();
    if (stream) run("terminal.kill", { terminal: stream.address });
  }

  // Why per role: a command reaches every shown copy of the mod, and each must be handled exactly once.
  commandsOf(role) {
    const whileListed = (action) => (cx) => {
      if (this.listVisible()) action(cx);
    };
    switch (role) {
      case "button":
        return new Map([["toggle", () => this.togglePanel()]]);
      case "bar":
        return new Map([["back", () => leaveScreen({ shutDown: true })], ...[...STREAM_KEYS.keys()].map((control) => [control, () => this.press(control)])]);
      default:
        return new Map([
          ["next", whileListed(() => this.moveCursor(1))],
          ["prev", whileListed(() => this.moveCursor(-1))],
          ["open", whileListed((cx) => this.activate(this.deviceAtCursor(), cx))],
          ["stop", whileListed((cx) => this.stop(this.deviceAtCursor(), cx))],
          ["fold", whileListed(() => this.foldAtCursor())],
          ["reload", whileListed(() => this.requestReload())],
        ]);
    }
  }

  togglePanel() {
    if (panelOf(layout()).open) {
      leaveScreen({ shutDown: true });
      run("layout.hide", { id: PANEL });
    } else {
      run("layout.select", { stack: PANEL, child: LIST });
      run("layout.show", { id: PANEL });
    }
  }

  // Why here and not in a click handler: the panel can also be closed by a key, a command or another mod, and the device can go away by itself.
  reconcile() {
    if (checking()) return;
    const screen = shared(SCREEN_KEY);
    const stream = liveStream();
    const action = reconcileAction(panelOf(layout()), screen, stream?.address ?? null, this.fresh);
    this.fresh = false;
    if (action.type === "tidy") {
      if (action.killStream) run("terminal.kill", { terminal: stream.address });
      if (action.showList) run("layout.select", { stack: PANEL, child: LIST });
    } else if (action.type === "leave") {
      if (action.announce) notify({ title: "The device screen closed", body: screen.name, level: "info" });
      leaveScreen({ shutDown: action.shutDown });
    }
  }

  renderButton(colors) {
    this.reconcile();
    const selected = panelOf(layout()).open;
    return h_flex().size_full().pr(10).items_center().bg(colors.chrome).border_b(1).border_color(colors.border)
      .child(h_flex().id("simulators-toggle").h(26).px(8).gap(6).flex_none().items_center().rounded(6)
        .text_size(12).bg(selected ? colors.selected : colors.chrome).text_color(selected ? colors.foreground : colors.muted)
        .hover((style) => style.bg(colors.hover)).on_mouse_down("left", stopPress)
        .on_click(() => this.togglePanel())
        .child(div().w(8).h(13).flex_none().rounded(2.5).border(1.5).border_color(selected ? colors.foreground : colors.muted))
        .child("Simulator"));
  }

  press(control) {
    const stream = liveStream();
    if (stream) hc(["keys", stream.address, STREAM_KEYS.get(control)]).catch(() => {});
  }

  renderBar(colors) {
    const screen = shared(SCREEN_KEY);
    const control = (id, label, action) => div().id(`simulators-${id}`).h(24).px(8).flex_none().flex().items_center().rounded(6)
      .text_size(12).text_color(colors.muted).hover((style) => style.bg(colors.hover).text_color(colors.foreground))
      .on_click(action).child(label);
    return h_flex().size_full().px(8).gap(4).items_center().bg(colors.chrome).border_b(1).border_color(colors.border)
      .child(control("back", "‹ Simulators", () => leaveScreen({ shutDown: true })))
      .child(div().flex_1().min_w(0).px(4).truncate().text_size(12.5).text_color(colors.foreground).child(screen?.name ?? ""))
      .child(control("home", "Home", () => this.press("home")))
      .child(control("lock", "Lock", () => this.press("lock")))
      .child(control("rotate", "Rotate", () => this.press("rotate")));
  }

  listVisible() {
    const panel = panelOf(layout());
    return panel.open && panel.child !== SCREEN;
  }

  // Why a parked task and not a timer: the tools are slow enough (the Android CLI takes most of a second of CPU) that the list is read once and then only when asked.
  async loadOnRequest(cx) {
    for (;;) {
      if (!this.reloadWanted) await new Promise((resolve) => { this.wake = resolve; });
      this.wake = null;
      this.reloadWanted = false;
      this.loading = true;
      cx.notify();
      try {
        await this.reload();
      } finally {
        this.loading = false;
        cx.notify();
      }
    }
  }

  requestReload() {
    this.reloadWanted = true;
    this.wake?.();
  }

  async reload(kind = null) {
    const [simulators, emulators] = await Promise.all([
      kind === "android" ? this.simulators : listOf("xcrun", ["simctl", "list", "devices", "-j"], parseSimulators),
      kind === "ios" ? this.emulators : listOf(ANDROID_CLI, ["emulator", "list", "--long"], parseEmulators),
    ]);
    this.simulators = simulators;
    this.emulators = emulators;
    this.loaded = true;
  }

  groups() {
    return groupDevices(this.emulators, this.simulators);
  }

  devices() {
    return [...this.emulators, ...this.simulators];
  }

  deviceAtCursor() {
    return this.devices().find((device) => device.key === this.cursor) ?? null;
  }

  moveCursor(step) {
    const keys = rowsOf(this.groups(), this.folds).filter((row) => row.device).map((row) => row.device.key);
    if (keys.length === 0) return;
    const at = keys.indexOf(this.cursor);
    this.cursor = keys[at < 0 ? (step > 0 ? 0 : keys.length - 1) : (at + step + keys.length) % keys.length];
  }

  foldAtCursor() {
    const groups = this.groups();
    const group = groups.find((candidate) => candidate.devices.some((device) => device.key === this.cursor)) ?? groups[0];
    if (group) this.toggleFold(group, isOpen(group, this.folds));
  }

  toggleFold(group, open) {
    this.folds.set(group.key, !open);
    localStorage.setItem(FOLDS_KEY, JSON.stringify([...this.folds]));
  }

  withBusy(device, label, cx, work) {
    if (!device) return;
    trackBusy(this.busy, device.key, label, cx, work, (error) => {
      notify({ title: `${label} ${displayName(device.name)} failed`, body: String(error?.message ?? error), level: "error" });
    });
  }

  activate(device, cx) {
    if (!device) return;
    if (device.running) this.withBusy(device, "Opening", cx, (cx) => this.openScreen(device, cx));
    else this.boot(device, cx);
  }

  boot(device, cx) {
    const command = bootCommand(device);
    if (!command) return;
    this.withBusy(device, "Booting", cx, (cx) => bootAndShow(device, {
      boot: async () => {
        await exec(command.command, command.args, { timeout: command.timeout });
        await this.reload(device.kind);
      },
      find: (key) => this.devices().find((candidate) => candidate.key === key),
      listVisible: () => this.listVisible(),
      open: (booted) => this.openScreen(booted, cx),
      shutDown: (booted) => this.shutDown(booted),
    }));
  }

  async shutDown(device) {
    const command = stopCommand(device);
    if (!command) return;
    await exec(command.command, command.args, { timeout: command.timeout });
    await this.reload(device.kind);
  }

  stop(device, cx) {
    if (!device?.running) return;
    this.withBusy(device, "Stopping", cx, async () => {
      if (shared(SCREEN_KEY)?.key === device.key) leaveScreen();
      await this.shutDown(device);
    });
  }

  async openScreen(device, cx) {
    if (this.opening) return;
    this.opening = true;
    const screen = { key: device.key, kind: device.kind, id: device.id, name: displayName(device.name), address: null };
    try {
      setShared(SCREEN_KEY, screen);
      const tty = await viewTty();
      await restoreViewBlock();
      const command = tty && streamCommand({ device, viewer: `${appHome()}/${VIEWER_PATH}`, tty });
      if (!command) throw new Error("there is no terminal to draw in");
      const started = await hc(command);
      const address = started.code === 0 ? JSON.parse(started.stdout).address : null;
      if (typeof address !== "string") throw new Error(started.stderr.trim() || "the stream did not start");
      for (let waited = 0; liveStream()?.address !== address; waited += STREAM_APPEAR_STEP_MS) {
        if (waited >= STREAM_APPEAR_MS) throw new Error("the stream stopped at once");
        await cx.sleep(STREAM_APPEAR_STEP_MS);
      }
      setShared(SCREEN_KEY, { ...screen, address });
      run("layout.select", { stack: PANEL, child: SCREEN });
    } catch (error) {
      leaveScreen();
      throw error;
    } finally {
      this.opening = false;
    }
  }

  renderRow(device, colors) {
    const busy = this.busy.get(device.key) ?? (stoppingKey() === device.key ? "Stopping" : undefined);
    const atCursor = device.key === this.cursor;
    const action = (label, icon, perform) => div().id(`simulators-act-${device.key}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
      .border(1).border_color(colors.border).text_color(colors.muted)
      .hover((style) => style.bg(colors.hover).text_color(colors.foreground))
      .tooltip(label)
      .on_mouse_down("left", stopPress)
      .on_click((_event, cx) => { cx.stop_propagation(); perform(cx); })
      .child(svg(icon).size(11));
    return h_flex().id(`simulators-row-${device.key}`).h(30).pl(24).pr(8).gap(8).flex_none().items_center().rounded(6)
      .bg(atCursor ? colors.selected : colors.chrome).hover((style) => style.bg(colors.hover))
      .when(device.running && !busy, (row) => row.on_click((_event, cx) => this.activate(device, cx)))
      .child(div().size(7).flex_none().rounded(3.5).bg(device.running ? colors.working : colors.border))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(device.running ? colors.foreground : colors.muted).child(displayName(device.name)))
      .when(busy, (row) => row
        .child(div().text_size(11.5).text_color(colors.dim).child(busy))
        .child(div().w(12).text_size(12).text_color(colors.dim).frames(SPINNER, SPINNER_MS)))
      .when(!busy && device.running, (row) => row.child(action("Stop", ICONS.stop, (cx) => this.stop(device, cx))))
      .when(!busy && !device.running, (row) => row.child(action("Boot", ICONS.boot, (cx) => this.boot(device, cx))));
  }

  renderGroup(group, open, colors) {
    const running = group.devices.filter((device) => device.running).length;
    return h_flex().id(`simulators-group-${group.key}`).h(28).px(8).gap(6).flex_none().items_center().rounded(6)
      .text_size(11.5).text_color(colors.dim).hover((style) => style.bg(colors.hover))
      .on_click((_event, cx) => { this.toggleFold(group, open); cx.notify(); })
      .child(div().w(10).flex_none().child(open ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(group.title))
      .child(div().flex_none().child(running > 0 ? `${running} running · ${group.devices.length}` : String(group.devices.length)));
  }

  renderList(colors) {
    const changed = shared(CHANGED_KEY) ?? null;
    if (shouldLoad({ changed, seenChange: this.seenChange, loaded: this.loaded, loading: this.loading, reloadWanted: this.reloadWanted, listVisible: this.listVisible() })) {
      this.seenChange = changed;
      this.requestReload();
    }
    const rows = rowsOf(this.groups(), this.folds);
    const empty = div().p(10).text_size(12).text_color(colors.dim).child(this.loaded ? "No simulators or emulators found" : "Looking for devices…");
    const body = v_flex().id("simulators-scroll").flex_1().min_h(0).p(6).gap(1).overflow_y_scrollbar()
      .children(rows.length === 0 ? [empty] : rows.map((row) => (row.device ? this.renderRow(row.device, colors) : this.renderGroup(row.group, row.open, colors))));
    return v_flex().size_full().bg(colors.chrome)
      .child(h_flex().h(36).px(14).flex_none().items_center().border_b(1).border_color(colors.border)
        .child(div().flex_1().text_size(12.5).font_semibold().text_color(colors.foreground).child("Simulators"))
        .child(div().id("simulators-reload").size(24).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(colors.muted).hover((style) => style.bg(colors.hover).text_color(colors.foreground))
          .tooltip("Reload")
          .on_click((_event, cx) => { this.requestReload(); cx.notify(); })
          .child(this.loading ? svg(ICONS.reload).size(14).spin(900) : svg(ICONS.reload).size(14))))
      .child(body);
  }

  render() {
    const colors = theme();
    if (this.role === "button") return this.renderButton(colors);
    if (this.role === "bar") return this.renderBar(colors);
    return this.renderList(colors);
  }
}
