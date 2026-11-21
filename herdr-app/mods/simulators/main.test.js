import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["h_flex", "v_flex"],
  herdr: ["appHome", "checking", "exec", "hc", "layout", "nextCommand", "notify", "props", "readTextFile", "run", "setShared", "shared", "terminals", "theme"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const mod = await import("./main.js");
const viewerIds = await import("./viewer/ids.js");
const {
  bootCommand,
  displayName,
  findNode,
  groupDevices,
  isOpen,
  panelOf,
  parseEmulators,
  parseSimulators,
  rowsOf,
  stopCommand,
  streamCommand,
  ttyOf,
  layoutFile,
  withViewBlock,
} = mod;

// The mod cannot import the viewer's modules (Herdr refuses a symlinked import), so both sides carry the id checks and these cases hold them to the same answers.
for (const [side, ids] of [["mod", mod], ["viewer", viewerIds]]) {
  test(`${side}: accepts simulator UDIDs only in their exact form`, () => {
    assert.equal(ids.isUdid("71E66660-C8B7-447B-AF87-531431BF3F50"), true);
    for (const value of ["71e66660-c8b7-447b-af87-531431bf3f50", "71E66660-C8B7-447B-AF87-531431BF3F50\n", " 71E66660-C8B7-447B-AF87-531431BF3F50", "71E66660C8B7447BAF87531431BF3F50", "booted", "", null, 7]) {
      assert.equal(ids.isUdid(value), false);
    }
  });

  test(`${side}: accepts emulator serials only as adb prints them`, () => {
    assert.equal(ids.isSerial("emulator-5554"), true);
    assert.equal(ids.isSerial("emulator-55540"), true);
    for (const value of ["emulator-5554 ", "emulator-", "emulator-5554;x", "192.168.0.2:5555", "-s", "", undefined]) assert.equal(ids.isSerial(value), false);
  });

  test(`${side}: accepts AVD ids that cannot be read as an option or a path`, () => {
    for (const value of ["Small_Phone_36", "Pixel_Tablet_E2E_36.1", "a", "Pixel-7"]) assert.equal(ids.isAvdId(value), true);
    for (const value of ["-avd", "--headless", ".hidden", "a b", "a/b", "a\nb", "", "x".repeat(129), null]) assert.equal(ids.isAvdId(value), false);
  });

  test(`${side}: accepts only pseudo-terminal device paths`, () => {
    assert.equal(ids.isTty("/dev/ttys014"), true);
    for (const value of ["/dev/tty", "/dev/ttys", "/dev/ttys014/..", "/dev/ttys01a", "ttys014", "/tmp/ttys014", ""]) assert.equal(ids.isTty(value), false);
  });
}

const UDID_A = "71E66660-C8B7-447B-AF87-531431BF3F50";
const UDID_B = "8AF905E9-8045-4CA8-86E7-BF15F3306525";
const UDID_C = "08D97595-94AF-41ED-B954-B1FF0A842706";

const simctl = (devices) => JSON.stringify({ devices });
const sim = (over) => ({ udid: UDID_A, name: "iPhone 17", state: "Shutdown", isAvailable: true, ...over });

const EMULATOR_TABLE = [
  "AVD ID                   AVD Name                      API Level      Status         Serial",
  "Pixel_Tablet_E2E_35      Pixel Tablet E2E 35           android-35     Offline",
  "Small_Phone_36           Small Phone 36                android-36.1   Online         emulator-5554",
  "Pixel_Tablet_E2E_36.1    Pixel Tablet E2E 36.1         android-36.1   Offline",
  "",
].join("\n");

test("reads iOS simulators with their runtime, state and last use", () => {
  const devices = parseSimulators(simctl({
    "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [
      sim({ state: "Booted", lastUsedAt: "2026-11-21T03:18:24Z" }),
      sim({ udid: UDID_C, name: "iPhone 17 Pro Max" }),
    ],
  }));
  assert.deepEqual(devices, [
    { key: `ios:${UDID_A}`, kind: "ios", id: UDID_A, name: "iPhone 17", running: true, runtime: "iOS 26.3", version: [26, 3], lastUsedAt: Date.parse("2026-11-21T03:18:24Z") },
    { key: `ios:${UDID_C}`, kind: "ios", id: UDID_C, name: "iPhone 17 Pro Max", running: false, runtime: "iOS 26.3", version: [26, 3], lastUsedAt: 0 },
  ]);
});

test("leaves out simulators it cannot use: other platforms, unavailable ones, odd ids", () => {
  const devices = parseSimulators(simctl({
    "com.apple.CoreSimulator.SimRuntime.watchOS-11-0": [sim({ name: "Watch" })],
    "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
      sim({ isAvailable: false }),
      sim({ udid: "not-a-udid" }),
      sim({ udid: `${UDID_B}; rm -rf ~` }),
      sim({ udid: UDID_B, name: 7 }),
      "junk",
      null,
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-18-3": "junk",
  }));
  assert.deepEqual(devices.map((device) => [device.id, device.name]), [[UDID_B, "Simulator"]]);
});

test("reads nothing from simctl output that is not the expected JSON", () => {
  for (const text of ["", "xcrun: error: unable to find utility", "[]", "{}", '{"devices":[]}', '{"devices":null}', null, undefined]) {
    assert.deepEqual(parseSimulators(text), []);
  }
});

test("reads the emulator table, names with spaces and ids with dots included", () => {
  assert.deepEqual(parseEmulators(EMULATOR_TABLE), [
    { key: "android:Pixel_Tablet_E2E_35", kind: "android", id: "Pixel_Tablet_E2E_35", name: "Pixel Tablet E2E 35", running: false, serial: null },
    { key: "android:Small_Phone_36", kind: "android", id: "Small_Phone_36", name: "Small Phone 36", running: true, serial: "emulator-5554" },
    { key: "android:Pixel_Tablet_E2E_36.1", kind: "android", id: "Pixel_Tablet_E2E_36.1", name: "Pixel Tablet E2E 36.1", running: false, serial: null },
  ]);
});

test("drops emulator rows it cannot trust and survives unexpected output", () => {
  const table = [
    "AVD ID      AVD Name      API Level      Status      Serial",
    "--version   Evil          android-35     Offline",
    "Ok_1        Fine          android-35     Online      emulator-5554; reboot",
    "Ok_2        Fine          android-35     Online",
    "Lonely",
  ].join("\n");
  assert.deepEqual(parseEmulators(table).map((device) => [device.id, device.running, device.serial]), [["Ok_1", false, null], ["Ok_2", false, null]]);
  for (const text of ["", "command not found: android", "Error: SDK not found\n  at x", null, undefined]) {
    assert.deepEqual(parseEmulators(text), []);
  }
});

const ios = (id, over = {}) => ({ key: `ios:${id}`, kind: "ios", id, name: id.slice(0, 4), running: false, runtime: "iOS 26.3", version: [26, 3], lastUsedAt: 0, ...over });
const android = (id, over = {}) => ({ key: `android:${id}`, kind: "android", id, name: id, running: false, serial: null, ...over });

test("groups Android first, then iOS runtimes newest first", () => {
  const groups = groupDevices(
    [android("B"), android("A", { running: true, serial: "emulator-5554" })],
    [
      ios(UDID_A, { runtime: "iOS 18.3", version: [18, 3] }),
      ios(UDID_B),
      ios(UDID_C, { runtime: "iOS 18.0", version: [18, 0] }),
    ],
  );
  assert.deepEqual(groups.map((group) => [group.key, group.title, group.devices.map((device) => device.id)]), [
    ["android", "Android", ["A", "B"]],
    ["iOS 26.3", "iOS 26.3", [UDID_B]],
    ["iOS 18.3", "iOS 18.3", [UDID_A]],
    ["iOS 18.0", "iOS 18.0", [UDID_C]],
  ]);
});

test("orders a group by running, then last use, then name without regard to case, then id", () => {
  const [group] = groupDevices([], [
    ios(UDID_A, { name: "b", lastUsedAt: 5 }),
    ios(UDID_B, { name: "a" }),
    ios(UDID_C, { name: "c", running: true }),
    ios("AAAAAAAA-0000-0000-0000-000000000000", { name: "A" }),
  ]);
  assert.deepEqual(group.devices.map((device) => device.name), ["c", "b", "a", "A"]);
});

test("opens Android, the newest runtime and groups with a running device unless folded by hand", () => {
  const groups = groupDevices([android("A")], [
    ios(UDID_A),
    ios(UDID_B, { runtime: "iOS 18.3", version: [18, 3], running: true }),
    ios(UDID_C, { runtime: "iOS 18.0", version: [18, 0] }),
  ]);
  assert.deepEqual(groups.map((group) => isOpen(group, new Map())), [true, true, true, false]);
  assert.deepEqual(groups.map((group) => isOpen(group, new Map([["android", false], ["iOS 18.0", true]]))), [false, true, true, true]);
});

test("leaves out empty sections", () => {
  assert.deepEqual(groupDevices([], []), []);
  assert.deepEqual(groupDevices([], [ios(UDID_A)]).map((group) => group.key), ["iOS 26.3"]);
});

test("lists rows for drawing: every group, and the devices of the open ones", () => {
  const groups = groupDevices([android("A")], [ios(UDID_A), ios(UDID_C, { runtime: "iOS 18.0", version: [18, 0] })]);
  assert.deepEqual(rowsOf(groups, new Map()).map((row) => (row.device ? row.device.id : `# ${row.group.key} ${row.open}`)), [
    "# android true", "A", "# iOS 26.3 true", UDID_A, "# iOS 18.0 false",
  ]);
});

test("builds boot and stop commands from validated ids only", () => {
  assert.deepEqual(bootCommand(ios(UDID_A)), { command: "xcrun", args: ["simctl", "bootstatus", UDID_A, "-b"], timeout: 300_000 });
  assert.deepEqual(stopCommand(ios(UDID_A)), { command: "xcrun", args: ["simctl", "shutdown", UDID_A], timeout: 60_000 });
  assert.deepEqual(bootCommand(android("Small_Phone_36")), { command: "/opt/homebrew/bin/android", args: ["emulator", "start", "--headless", "Small_Phone_36"], timeout: 300_000 });
  assert.deepEqual(stopCommand(android("Small_Phone_36")), { command: "/opt/homebrew/bin/android", args: ["emulator", "stop", "Small_Phone_36"], timeout: 60_000 });
  for (const device of [ios("x"), android("--headless"), android("a b"), { kind: "tv", id: UDID_A }, null]) {
    assert.equal(bootCommand(device), null);
    assert.equal(stopCommand(device), null);
  }
});

test("builds the stream terminal's command line, or nothing when a value is off", () => {
  const base = { viewer: "/Users/me/.config/herdr-app/mods/simulators/viewer/viewer.js", tty: "/dev/ttys014" };
  assert.deepEqual(streamCommand({ ...base, device: ios(UDID_A, { name: "x\n--evil" }) }), [
    "run", "--json", "--bg", "--no-parent", "--rm", "--name", "simulators-stream", "--",
    "node", base.viewer, "ios", UDID_A, "/dev/ttys014",
  ]);
  assert.deepEqual(streamCommand({ ...base, device: android("A", { running: true, serial: "emulator-5554" }) }).slice(-3), ["android", "emulator-5554", "/dev/ttys014"]);
  assert.equal(streamCommand({ ...base, device: android("A") }), null);
  assert.equal(streamCommand({ ...base, tty: "/dev/ttys014; true", device: ios(UDID_A) }), null);
  assert.equal(streamCommand({ ...base, tty: "/tmp/x", device: ios(UDID_A) }), null);
  assert.equal(streamCommand({ ...base, device: ios("nope") }), null);
});

test("finds the terminal device of a process from ps output", () => {
  assert.equal(ttyOf("ttys014\n"), "/dev/ttys014");
  assert.equal(ttyOf("  ttys003  "), "/dev/ttys003");
  for (const text of ["??", "", "ttys01 4", "console", "../ttys001", null]) assert.equal(ttyOf(text), null);
});

test("reads the panel's state from the live layout", () => {
  const layout = (panel) => ({ id: "root", children: [{ id: "work", children: [{ id: "main" }, panel] }] });
  assert.deepEqual(panelOf(layout({ id: "simulators-panel", hidden: true, active: "simulators-list" })), { present: true, open: false, child: "simulators-list" });
  assert.deepEqual(panelOf(layout({ id: "simulators-panel", active: "simulators-screen" })), { present: true, open: true, child: "simulators-screen" });
  assert.deepEqual(panelOf(layout({ id: "other" })), { present: false, open: false, child: null });
  assert.deepEqual(panelOf(null), { present: false, open: false, child: null });
  assert.equal(findNode({ id: "a", children: [{ id: "b", children: [{ id: "c" }] }] }, "c").id, "c");
});

test("makes any device name safe to show on one line", () => {
  assert.equal(displayName("iPhone 17"), "iPhone 17");
  assert.equal(displayName("a\nb\tc\u0007d\u001b[31m"), "a b c d [31m");
  assert.equal(displayName("x".repeat(200)).length, 80);
  assert.equal(displayName(""), "Unnamed");
  assert.equal(displayName(undefined), "Unnamed");
});

test("puts the terminal block back into a layout that lost it, and leaves a whole layout alone", () => {
  const bar = { id: "simulators-bar", type: "block", content: { mod: "devices", props: { bar: true } } };
  const layoutWith = (children) => ({ id: "root", type: "row", children: [{ id: "simulators-panel", type: "stack", children: [{ id: "simulators-list", type: "block" }, { id: "simulators-screen", type: "column", children }] }] });
  const view = { id: "simulators-view", type: "block", content: { terminal: "simulators-view" } };
  const lost = layoutWith([bar]);
  assert.deepEqual(withViewBlock(lost), layoutWith([bar, view]));
  assert.deepEqual(lost, layoutWith([bar]));
  assert.equal(JSON.stringify(withViewBlock(lost)), JSON.stringify(layoutWith([bar, view])));
  assert.equal(withViewBlock(layoutWith([bar, view])), null);
  assert.equal(withViewBlock({ id: "root", children: [] }), null);
  assert.equal(withViewBlock(null), null);
});

test("names the shown layout's file, for names that are plain file names only", () => {
  assert.equal(layoutFile("/Users/me/.config/herdr-app", "personal"), "/Users/me/.config/herdr-app/layouts/personal.json");
  for (const name of ["../keys", "a/b", "", null, "x y"]) assert.equal(layoutFile("/Users/me/.config/herdr-app", name), null);
});

const { bootAndShow, reconcileAction, shouldLoad, stoppingKeyOf, trackBusy } = mod;

const OPEN_ON_SCREEN = { present: true, open: true, child: "simulators-screen" };
const OPEN_ON_LIST = { present: true, open: true, child: "simulators-list" };
const CLOSED_ON_SCREEN = { present: true, open: false, child: "simulators-screen" };
const SHOWN = { key: "ios:A", name: "iPhone 17", address: "t9" };

test("leaves a shown screen alone while its stream runs and the panel is open", () => {
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, SHOWN, "t9", false), { type: "none" });
});

test("shuts the device down when the panel is closed over its screen", () => {
  assert.deepEqual(reconcileAction(CLOSED_ON_SCREEN, SHOWN, "t9", false), { type: "leave", shutDown: true, announce: false });
});

test("leaves without shutting down, and says so, when the stream ended by itself", () => {
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, SHOWN, null, false), { type: "leave", shutDown: false, announce: true });
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, SHOWN, "t10", false), { type: "leave", shutDown: false, announce: true });
});

test("waits for a screen that is still being opened", () => {
  assert.deepEqual(reconcileAction(OPEN_ON_LIST, { ...SHOWN, address: null }, null, false), { type: "none" });
});

test("clears a screen record found at start, quietly and without shutting anything down", () => {
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, { ...SHOWN, address: null }, null, true), { type: "leave", shutDown: false, announce: false });
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, SHOWN, null, true), { type: "leave", shutDown: false, announce: false });
});

test("tidies up a stream or a screen view that has no screen record", () => {
  assert.deepEqual(reconcileAction(OPEN_ON_SCREEN, null, "t9", false), { type: "tidy", killStream: true, showList: true });
  assert.deepEqual(reconcileAction(OPEN_ON_LIST, null, "t9", false), { type: "tidy", killStream: true, showList: false });
  assert.deepEqual(reconcileAction(OPEN_ON_LIST, null, null, false), { type: "none" });
});

test("does nothing in a layout without the panel", () => {
  assert.deepEqual(reconcileAction({ present: false, open: false, child: null }, SHOWN, null, false), { type: "none" });
});

test("shows a device as stopping only while its record is recent", () => {
  assert.equal(stoppingKeyOf({ key: "ios:A", at: 1_000 }, 30_000), "ios:A");
  assert.equal(stoppingKeyOf({ key: "ios:A", at: 1_000 }, 61_001), null);
  assert.equal(stoppingKeyOf(null, 30_000), null);
  assert.equal(stoppingKeyOf({ key: "ios:A" }, 30_000), null);
});

const LOAD = { changed: null, seenChange: null, loaded: true, loading: false, reloadWanted: false, listVisible: true };

test("reads the list the first time it is visible, and not again by itself", () => {
  assert.equal(shouldLoad({ ...LOAD, loaded: false }), true);
  assert.equal(shouldLoad(LOAD), false);
  assert.equal(shouldLoad({ ...LOAD, loaded: false, listVisible: false }), false);
  assert.equal(shouldLoad({ ...LOAD, loaded: false, loading: true }), false);
  assert.equal(shouldLoad({ ...LOAD, loaded: false, reloadWanted: true }), false);
});

test("reads the list again when another copy says the devices changed", () => {
  assert.equal(shouldLoad({ ...LOAD, changed: 5, seenChange: 4 }), true);
  assert.equal(shouldLoad({ ...LOAD, changed: 5, seenChange: 5 }), false);
  assert.equal(shouldLoad({ ...LOAD, changed: 5, seenChange: null, listVisible: false }), true);
});

const DEVICE = { key: "ios:A", kind: "ios", id: "A", name: "iPhone 17", running: false };
const stepsOf = (over = {}) => {
  const calls = [];
  const steps = {
    boot: async () => { calls.push("boot"); },
    find: () => ({ ...DEVICE, running: true }),
    listVisible: () => true,
    open: async () => { calls.push("open"); },
    shutDown: async () => { calls.push("shutDown"); },
    ...over,
  };
  return { calls, steps };
};

test("boots a device and then opens its screen", async () => {
  const { calls, steps } = stepsOf();
  await bootAndShow(DEVICE, steps);
  assert.deepEqual(calls, ["boot", "open"]);
});

test("fails without opening anything when the device did not come up", async () => {
  const { calls, steps } = stepsOf({ find: () => ({ ...DEVICE, running: false }) });
  await assert.rejects(bootAndShow(DEVICE, steps), /did not come up/);
  assert.deepEqual(calls, ["boot"]);
});

test("leaves the device running when the list is no longer visible after booting", async () => {
  const { calls, steps } = stepsOf({ listVisible: () => false });
  await bootAndShow(DEVICE, steps);
  assert.deepEqual(calls, ["boot"]);
});

test("shuts the device down again when its screen cannot be shown, and reports why", async () => {
  const { calls, steps } = stepsOf({ open: async () => { calls.push("open"); throw new Error("the stream stopped at once"); } });
  await assert.rejects(bootAndShow(DEVICE, steps), /the stream stopped at once; it was shut down again/);
  assert.deepEqual(calls, ["boot", "open", "shutDown"]);
});

test("still reports the screen's failure when shutting down fails too", async () => {
  const { steps } = stepsOf({ open: async () => { throw new Error("no terminal"); }, shutDown: async () => { throw new Error("simctl failed"); } });
  await assert.rejects(bootAndShow(DEVICE, steps), /no terminal; it was shut down again/);
});

// A click's context stops being valid when its handler returns, as Herdr's does.
function clickContext() {
  let isValid = true;
  const tasks = [];
  const use = () => { if (!isValid) throw new Error("cx is no longer valid"); };
  const spawned = { notifications: 0, notify() { this.notifications += 1; } };
  const click = { notify: use, spawn(task) { use(); tasks.push(task(spawned)); } };
  return { click, spawned, expire: () => { isValid = false; }, settled: () => Promise.all(tasks) };
}

test("runs slow work on a task's own context, so it outlives the click that started it", async () => {
  const { click, spawned, expire, settled } = clickContext();
  const busy = new Map();
  const errors = [];
  let used = null;
  assert.equal(trackBusy(busy, "ios:A", "Booting", click, async (cx) => { await null; cx.notify(); used = cx; }, (error) => errors.push(error)), true);
  assert.equal(busy.get("ios:A"), "Booting");
  expire();
  await settled();
  assert.equal(used, spawned);
  assert.deepEqual(errors, []);
  assert.equal(busy.has("ios:A"), false);
  assert.equal(spawned.notifications, 2);
});

test("clears the busy mark and reports the error when the work fails", async () => {
  const { click, settled } = clickContext();
  const busy = new Map();
  const errors = [];
  trackBusy(busy, "ios:A", "Booting", click, async () => { throw new Error("it did not come up"); }, (error) => errors.push(error.message));
  await settled();
  assert.deepEqual(errors, ["it did not come up"]);
  assert.equal(busy.has("ios:A"), false);
});

test("ignores a second request for a device that is already busy", () => {
  const { click } = clickContext();
  const busy = new Map([["ios:A", "Booting"]]);
  assert.equal(trackBusy(busy, "ios:A", "Stopping", click, async () => {}, () => {}), false);
  assert.equal(busy.get("ios:A"), "Booting");
});
