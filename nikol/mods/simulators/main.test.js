import assert from "node:assert/strict";
import { test } from "node:test";

const mod = await import("./main.js");
const viewerIds = await import(`${process.env.HOME}/src/github.com/mataku/dotfiles/herdr-app/mods/simulators/viewer/ids.js`);
const { bootCommand, createSimulators, displayName, failureOf, groupDevices, isOpen, parseEmulators, parseSimulators, readFolds, rowsOf, stopCommand, viewerCommand } = mod;

// The viewer is shared with the herdr mod and checks the same ids, so these cases hold both sides to the same answers.
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
  assert.deepEqual(bootCommand(ios(UDID_A)), { command: "xcrun", args: ["simctl", "bootstatus", UDID_A, "-b"], timeout: 120_000 });
  assert.deepEqual(stopCommand(ios(UDID_A)), { command: "xcrun", args: ["simctl", "shutdown", UDID_A], timeout: 60_000 });
  assert.deepEqual(bootCommand(android("Small_Phone_36")), { command: "/opt/homebrew/bin/android", args: ["emulator", "start", "--headless", "Small_Phone_36"], timeout: 120_000 });
  assert.deepEqual(stopCommand(android("Small_Phone_36")), { command: "/opt/homebrew/bin/android", args: ["emulator", "stop", "Small_Phone_36"], timeout: 60_000 });
  for (const device of [ios("x"), android("--headless"), android("a b"), { kind: "tv", id: UDID_A }, null]) {
    assert.equal(bootCommand(device), null);
    assert.equal(stopCommand(device), null);
  }
});

test("makes any device name safe to show on one line", () => {
  assert.equal(displayName("iPhone 17"), "iPhone 17");
  assert.equal(displayName("a\nb\tc\u0007d\u001b[31m"), "a b c d [31m");
  assert.equal(displayName("x".repeat(200)).length, 80);
  assert.equal(displayName(""), "Unnamed");
  assert.equal(displayName(undefined), "Unnamed");
});


test("builds the viewer's command line through sh, or nothing when a value is off", () => {
  const command = viewerCommand(ios(UDID_A, { name: "x\n--evil" }), "/dev/ttys014");
  assert.equal(command.command, "sh");
  assert.deepEqual(command.args.slice(2), [mod.VIEWER, mod.VIEWER_LOG, "ios", UDID_A, "/dev/ttys014"]);
  assert.deepEqual(viewerCommand(android("A", { running: true, serial: "emulator-5554" }), "/dev/ttys014").args.slice(-3), ["android", "emulator-5554", "/dev/ttys014"]);
  assert.equal(viewerCommand(android("A"), "/dev/ttys014"), null);
  assert.equal(viewerCommand(ios(UDID_A), "/dev/ttys014; true"), null);
  assert.equal(viewerCommand(ios(UDID_A), "/tmp/x"), null);
  assert.equal(viewerCommand(ios("nope"), "/dev/ttys014"), null);
});

test("reads stored folds, dropping broken entries", () => {
  assert.deepEqual(readFolds([["android", false], ["x"], [1, true], "junk"]), new Map([["android", false]]));
  assert.deepEqual(readFolds(null), new Map());
});

const ended = (over = {}) => ({ id: "x", code: 0, stdout: "", stderr: "", truncated: false, error: null, ...over });

test("tells a failure from what a program reported, and a stop by the mod from neither", () => {
  assert.equal(failureOf(ended()), null);
  assert.equal(failureOf(ended({ error: "stopped", code: null })), null);
  assert.equal(failureOf(ended({ error: "not-found", code: null })), "the tool is not installed");
  assert.equal(failureOf(ended({ code: 149, stderr: "Booting\nUnable to boot device in current state: Booted\n" })), "Unable to boot device in current state: Booted");
  assert.equal(failureOf(ended({ code: 2 })), "exited with 2");
});

const node = (type) => (first, options) => ({ type, first, ...options });

function fakeNikol(files = {}) {
  const runs = [];
  const stopped = [];
  const written = [];
  const ui = Object.fromEntries(["column", "row", "text", "dot", "scroll", "icon", "spinner", "divider", "spacer"].map((type) => [type, node(type)]));
  ui.button = (id, children, options) => ({ type: "button", id, children, ...options });
  ui.terminal = (id) => ({ type: "terminal", id });
  const exec = (id, program, args, options) => runs.push({ id, program, args, options });
  exec.stop = (id) => stopped.push(id);
  exec.write = (id, text) => written.push([id, text]);
  return {
    runs,
    stopped,
    written,
    files,
    ui,
    exec,
    data: { read: (path) => files[path] ?? null, write: (path, text) => { files[path] = text; return true; } },
  };
}

const BOOTED = simctl({ "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [sim({ state: "Booted" })] });
const SHUTDOWN = simctl({ "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [sim()] });
const treeOf = (mod) => JSON.stringify(mod.render());

function listedWith(nikol, mod, ios) {
  mod.event("exec", ended({ id: "list:ios", stdout: ios }));
  mod.event("exec", ended({ id: "list:android", stdout: EMULATOR_TABLE }));
}

test("reads the devices the first time it is shown", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  assert.deepEqual(nikol.runs, []);
  mod.event("shown", {});
  assert.deepEqual(nikol.runs.map((r) => r.id), ["list:ios", "list:android"]);
  listedWith(nikol, mod, BOOTED);
  assert.equal(mod.model.simulators[0].running, true);
  mod.event("hidden", {});
  mod.event("shown", {});
  assert.equal(nikol.runs.filter((r) => r.id.startsWith("list:")).length, 2);
});

test("shows a running device's screen in a terminal and hands its tty to the viewer", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  mod.event("click", { id: `row:ios:${UDID_A}` });
  assert.match(treeOf(mod), /"type":"terminal","id":"screen"/);
  mod.event("terminal", { id: "screen", tty: "/dev/ttys021" });
  const viewer = nikol.runs.at(-1);
  assert.equal(viewer.id, "viewer");
  assert.deepEqual(viewer.args.slice(-3), ["ios", UDID_A, "/dev/ttys021"]);
  assert.deepEqual(viewer.options, { timeout: 0, input: true });
  mod.event("click", { id: "home" });
  assert.deepEqual(nikol.written, [["viewer", "h"]]);
});

test("going back stops the viewer and shuts the device down", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  mod.event("click", { id: `row:ios:${UDID_A}` });
  mod.event("terminal", { id: "screen", tty: "/dev/ttys021" });
  mod.event("click", { id: "back" });
  assert.deepEqual(nikol.stopped, ["viewer"]);
  assert.deepEqual(nikol.runs.at(-1).args, ["simctl", "shutdown", UDID_A]);
  assert.doesNotMatch(treeOf(mod), /"type":"terminal"/);
  mod.event("exec", ended({ id: "viewer", error: "stopped", code: null }));
  assert.equal(mod.model.notice, null);
});

test("closing the panel over a screen shuts the device down too", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  mod.event("click", { id: `row:ios:${UDID_A}` });
  mod.event("hidden", {});
  assert.deepEqual(nikol.stopped, ["viewer"]);
  assert.deepEqual(nikol.runs.at(-1).args, ["simctl", "shutdown", UDID_A]);
});

test("a viewer that ends by itself leaves the screen and says so, without shutting anything down", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  mod.event("click", { id: `row:ios:${UDID_A}` });
  mod.event("terminal", { id: "screen", tty: "/dev/ttys021" });
  const before = nikol.runs.length;
  mod.event("exec", ended({ id: "viewer", code: 1, stderr: "could not start: no device\n" }));
  assert.equal(mod.model.screen, null);
  assert.match(mod.model.notice, /could not start: no device/);
  assert.equal(nikol.runs.slice(before).some((r) => r.args.includes("shutdown")), false);
});

test("boots a device and then opens its screen", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, SHUTDOWN);
  mod.event("click", { id: `act:ios:${UDID_A}` });
  assert.deepEqual(nikol.runs.at(-1).args, ["simctl", "bootstatus", UDID_A, "-b"]);
  assert.equal(mod.model.busy.get(`ios:${UDID_A}`), "Booting");
  mod.event("exec", ended({ id: `boot:ios:${UDID_A}` }));
  listedWith(nikol, mod, BOOTED);
  assert.equal(mod.model.screen?.key, `ios:${UDID_A}`);
});

test("a boot that fails says why next to the device and opens nothing", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, SHUTDOWN);
  mod.event("click", { id: `act:ios:${UDID_A}` });
  mod.event("exec", ended({ id: `boot:ios:${UDID_A}`, error: "timeout", code: null }));
  listedWith(nikol, mod, SHUTDOWN);
  assert.equal(mod.model.screen, null);
  assert.equal(mod.model.errors.get(`ios:${UDID_A}`), "timeout");
});

test("folding a group is kept for the next load", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  mod.event("click", { id: "fold:android" });
  assert.deepEqual(JSON.parse(nikol.files["folds.json"]), [["android", false]]);
  const again = createSimulators(fakeNikol({ ...nikol.files }));
  again.start();
  assert.deepEqual(again.model.folds, new Map([["android", false]]));
});

test("stops the adb server the Android CLI started, unless an Android screen is shown", () => {
  const nikol = fakeNikol();
  const mod = createSimulators(nikol);
  mod.start();
  mod.event("shown", {});
  listedWith(nikol, mod, BOOTED);
  assert.deepEqual(nikol.runs.filter((r) => r.id === "adb-stop").map((r) => [r.program, ...r.args]), [["adb", "kill-server"]]);
  mod.event("click", { id: "act:android:Small_Phone_36" });
  mod.event("exec", ended({ id: "stop:android:Small_Phone_36" }));
  assert.equal(nikol.runs.filter((r) => r.id === "adb-stop").length, 2);
  mod.event("exec", ended({ id: "list:ios", stdout: BOOTED }));
  mod.event("exec", ended({ id: "list:android", stdout: EMULATOR_TABLE }));
  mod.event("click", { id: "row:android:Small_Phone_36" });
  const before = nikol.runs.filter((r) => r.id === "adb-stop").length;
  mod.event("click", { id: "reload" });
  mod.event("exec", ended({ id: "list:ios", stdout: BOOTED }));
  mod.event("exec", ended({ id: "list:android", stdout: EMULATOR_TABLE }));
  assert.equal(mod.model.screen?.kind, "android");
  assert.equal(nikol.runs.filter((r) => r.id === "adb-stop").length, before);
});
