import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["Editor", "EditorState", "Input", "InputState", "ScrollHandle", "Textarea", "TextareaState", "h_flex", "v_flex"],
  herdr: ["appHome", "checking", "closeOverlay", "exec", "focused", "hc", "home", "notify", "props", "readTextFile", "run", "setShared", "settings", "shared", "spaces", "terminals", "theme", "writeTextFile"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const hostStubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = (...args) => globalThis.herdrStub.${name}(...args);`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, name === "herdr" ? hostStubOf(names) : stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const {
  default: ScheduledTasks, clockText, draftOf, draftsAfter, draftsFor, dueTasks, entryOfForm, fileText, fire, firesAfter, folderOf, forgetDeleted, isArmed, isQuarterMinute, isSlot, keepSchedule, listHeightOf, listRuns, liveOf,
  minuteOf, msToNextQuarter, namesBefore, needsYou, nextOf, parseFile, pastText, problemKeys, problemOf, problemToast, prune, readLog, removeInTime, removeRuns, resumeCommand, runText, scheduleText, sessionOf,
  shortFolder, signals, staleOf, statusText, stepCursor, ticker, toastOf, withEntry, withoutEntry,
} = await import("./main.js");

const at = (day, hour, minute, second = 0) => new Date(2026, 10, day, hour, minute, second).getTime();
const Q = 900_000;
const SESSION = "63e808c7-05f2-4099-8a53-3e9a8dbf0256";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const entry = (over = {}) => ({ name: "sync", prompt: "Pull", folder: "~/repo", schedule: { every: 60 }, ...over });
const textOf = (...entries) => JSON.stringify({ tasks: entries });
const every = (minutes) => ({ kind: "every", minutes });
const daily = (hour, minute, days = ALL_DAYS) => ({ kind: "daily", hour, minute, days });
const taskOf = (name, schedule, over = {}) => ({ name, enabled: true, prompt: "p", folder: "/f", command: ["claude"], schedule, ...over });
const printed = (value) => ({ code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" });
const failed = (code, stderr = "") => ({ code, stdout: "", stderr });
const settle = async () => { for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

function hostWith(answers = {}) {
  const calls = [];
  const hc = async (args) => {
    calls.push(["hc", args]);
    const answer = answers[args[0]];
    return typeof answer === "function" ? answer(args) : (answer ?? printed({}));
  };
  const exec = async (program, args, options) => {
    calls.push(["exec", program, args, options]);
    return answers.test ?? printed("");
  };
  const hcCalls = (verb) => calls.filter(([kind, args]) => kind === "hc" && args[0] === verb).map(([, args]) => args);
  return { host: { hc, exec, home: "/h" }, calls, hcCalls };
}

test("an absent or blank file has no tasks", () => {
  for (const text of [null, "  \n"]) {
    const { failure, entries, tasks, problems } = parseFile(text);
    assert.deepEqual({ failure, entries, tasks, problems }, { failure: null, entries: [], tasks: [], problems: [] });
  }
});

test("text that is not JSON is a failure", () => {
  const parsed = parseFile("{");
  assert.equal(parsed.failure, "scheduled-tasks.json is not valid JSON");
  assert.deepEqual(parsed.tasks, []);
});

test("a file without a tasks list is a failure", () => {
  for (const text of ["[]", '{"tasks":1}']) assert.equal(parseFile(text).failure, "scheduled-tasks.json must be an object with a tasks list");
});

test("an interval task is loaded with its defaults", () => {
  assert.deepEqual(parseFile(textOf(entry())).tasks, [{ name: "sync", enabled: true, prompt: "Pull", folder: "~/repo", command: ["claude"], schedule: { kind: "every", minutes: 60 } }]);
});

test("a daily task is loaded with its days as numbers", () => {
  const load = (over) => parseFile(textOf(entry(over))).tasks[0];
  assert.deepEqual(load({ command: " claude  --model x " }).command, ["claude", "--model", "x"]);
  assert.deepEqual(load({ schedule: { at: "09:15", days: ["fri", "mon"] } }).schedule, { kind: "daily", hour: 9, minute: 15, days: [1, 5] });
  assert.deepEqual(load({ schedule: { at: "09:15" } }).schedule.days, [0, 1, 2, 3, 4, 5, 6]);
});

test("each broken rule has its message", () => {
  const NAME = "name must be 1 to 26 characters of a-z, 0-9, - and _";
  const EVERY = "every must be 15, 30 or 60";
  const AT = "at must be a time on the quarter hour, like 09:30";
  const DAYS = "days must list some of mon, tue, wed, thu, fri, sat, sun";
  const EITHER = "schedule needs either every or at";
  const broken = [
    [7, "a task must be an object"],
    [null, "a task must be an object"],
    [[], "a task must be an object"],
    [entry({ name: "Sync" }), NAME],
    [entry({ name: "a".repeat(27) }), NAME],
    [entry({ name: "" }), NAME],
    [entry({ name: undefined }), NAME],
    [entry({ name: "taken" }), "name is already used"],
    [entry({ enabled: "yes" }), "enabled must be true or false"],
    [entry({ prompt: "  " }), "prompt must not be empty"],
    [entry({ prompt: undefined }), "prompt must not be empty"],
    [entry({ prompt: "- list" }), "prompt must not start with -"],
    [entry({ folder: "repo" }), "folder must start with / or ~/"],
    [entry({ folder: "~user" }), "folder must start with / or ~/"],
    [entry({ command: "--x" }), "command must name a program"],
    [entry({ command: " " }), "command must name a program"],
    [entry({ command: ["claude"] }), "command must name a program"],
    [entry({ schedule: undefined }), EITHER],
    [entry({ schedule: [] }), EITHER],
    [entry({ schedule: { every: 30, at: "09:00" } }), EITHER],
    [entry({ schedule: {} }), EITHER],
    [entry({ schedule: { every: 20 } }), EVERY],
    [entry({ schedule: { every: 45 } }), EVERY],
    [entry({ schedule: { every: "30" } }), EVERY],
    [entry({ schedule: { at: "9:00" } }), AT],
    [entry({ schedule: { at: "24:00" } }), AT],
    [entry({ schedule: { at: "09:05" } }), AT],
    [entry({ schedule: { at: 9 } }), AT],
    [entry({ schedule: { at: "09:00", days: [] } }), DAYS],
    [entry({ schedule: { at: "09:00", days: ["mon", "mon"] } }), DAYS],
    [entry({ schedule: { at: "09:00", days: ["monday"] } }), DAYS],
    [entry({ schedule: { at: "09:00", days: "mon" } }), DAYS],
  ];
  for (const [value, message] of broken) assert.equal(problemOf(value, new Set(["taken"])), message, JSON.stringify(value));
  for (const schedule of [{ every: 15 }, { every: 30 }, { every: 60 }, { at: "00:00" }, { at: "23:45" }]) assert.equal(problemOf(entry({ schedule }), new Set()), null);
  assert.equal(problemOf(entry({ name: "a".repeat(26), folder: "~", enabled: false }), new Set()), null);
});

const mixed = textOf(entry({ name: "a" }), entry({ name: "b", schedule: { every: 20 } }), entry({ name: "a" }), 7, entry({ name: "c", schedule: { every: 20 } }), entry({ name: "c" }));

test("an invalid entry is reported and kept, still takes its name, and the others load", () => {
  const { tasks, entries, problems } = parseFile(mixed);
  assert.deepEqual(tasks.map((task) => task.name), ["a"]);
  assert.deepEqual(entries, JSON.parse(mixed).tasks);
  assert.deepEqual(problems, [
    { index: 1, name: "b", message: "every must be 15, 30 or 60" },
    { index: 2, name: "a", message: "name is already used" },
    { index: 3, name: null, message: "a task must be an object" },
    { index: 4, name: "c", message: "every must be 15, 30 or 60" },
    { index: 5, name: "c", message: "name is already used" },
  ]);
});

test("a newly invalid entry is announced once", () => {
  const [b, , seven] = parseFile(mixed).problems;
  assert.deepEqual(problemToast([], [b]), { title: "b is not scheduled", body: "Open Tasks after fixing the file. every must be 15, 30 or 60", level: "error" });
  assert.deepEqual(problemToast([], [b, seven]), { title: "2 tasks are not scheduled", body: "Open Tasks after fixing the file. b, #4", level: "error" });
  assert.equal(problemToast(problemKeys([b]), [b]), null);
  assert.deepEqual(problemToast(problemKeys([b]), [b, seven]), { title: "#4 is not scheduled", body: "Open Tasks after fixing the file. a task must be an object", level: "error" });
  assert.deepEqual(problemKeys([b]), ["b: every must be 15, 30 or 60"]);
});

test("interval slots are on the clock", () => {
  for (const time of [at(24, 10, 0), at(24, 10, 0, 59), at(24, 10, 45)]) assert.equal(isSlot(every(15), time), true);
  for (const time of [at(24, 10, 1), at(24, 9, 59, 59)]) assert.equal(isSlot(every(15), time), false);
  assert.equal(isSlot(every(30), at(24, 10, 30)), true);
  assert.equal(isSlot(every(30), at(24, 10, 15)), false);
  assert.equal(isSlot(every(60), at(24, 23, 0)), true);
  assert.equal(isSlot(every(60), at(24, 23, 30)), false);
  assert.equal(nextOf(every(15), at(24, 10, 7)), at(24, 10, 15));
  assert.equal(nextOf(every(15), at(24, 10, 15)), at(24, 10, 30));
  assert.equal(nextOf(every(30), at(24, 10, 45)), at(24, 11, 0));
  assert.equal(nextOf(every(60), at(24, 23, 30)), at(25, 0, 0));
});

test("daily slots keep to their days", () => {
  const weekdays = daily(9, 0, [1, 2, 3, 4, 5]);
  assert.equal(isSlot(daily(9, 0), at(24, 9, 0, 30)), true);
  assert.equal(isSlot(daily(9, 0), at(24, 8, 59, 59)), false);
  assert.equal(isSlot(daily(9, 0), at(24, 9, 1)), false);
  assert.equal(isSlot(weekdays, at(27, 9, 0)), true);
  assert.equal(isSlot(weekdays, at(28, 9, 0)), false);
  assert.equal(nextOf(daily(9, 0), at(24, 8, 59)), at(24, 9, 0));
  assert.equal(nextOf(daily(9, 0), at(24, 9, 0)), at(25, 9, 0));
  assert.equal(nextOf(weekdays, at(28, 12, 0)), at(30, 9, 0));
});

test("a task is due while the clock shows its slot", () => {
  const a = taskOf("a", every(15));
  const b = taskOf("b", every(15), { enabled: false });
  const c = taskOf("c", daily(10, 0));
  const d = taskOf("d", daily(9, 0));
  const tasks = [a, b, c, d];
  assert.deepEqual(dueTasks(tasks, at(24, 10, 0, 2)), [a, c]);
  assert.deepEqual(dueTasks(tasks, at(24, 10, 0, 50)), [a, c]);
  assert.deepEqual(dueTasks(tasks, at(24, 10, 15)), [a]);
  assert.deepEqual(dueTasks(tasks, at(24, 10, 1)), []);
});

test("the wait runs to the next quarter hour", () => {
  assert.equal(msToNextQuarter(at(24, 10, 0)), 900000);
  assert.equal(msToNextQuarter(at(24, 10, 7)), 480000);
  assert.equal(msToNextQuarter(at(24, 10, 14, 59) + 999), 1);
  for (const time of [at(24, 10, 15), at(24, 10, 15, 59)]) assert.equal(isQuarterMinute(time), true);
  for (const time of [at(24, 10, 16), at(24, 10, 14, 59)]) assert.equal(isQuarterMinute(time), false);
  assert.equal(minuteOf(at(24, 10, 0, 59)), minuteOf(at(24, 10, 0)));
  assert.equal(minuteOf(at(24, 10, 1)), minuteOf(at(24, 10, 0)) + 1);
});

test("the mod is armed only while a valid task is switched on", () => {
  const on = taskOf("on", every(15));
  const off = taskOf("off", every(15), { enabled: false });
  const problem = { index: 0, name: "x", message: "m" };
  assert.equal(isArmed({ failure: null, problems: [], tasks: [on] }), true);
  assert.equal(isArmed({ failure: null, problems: [problem], tasks: [off, on] }), true);
  assert.equal(isArmed({ failure: null, problems: [], tasks: [] }), false);
  assert.equal(isArmed({ failure: null, problems: [], tasks: [off] }), false);
  assert.equal(isArmed({ failure: "x", problems: [], tasks: [] }), false);
  assert.equal(isArmed({ failure: null, problems: [problem], tasks: [] }), false);
});

test("a signal is kept until it is asked for", async () => {
  const box = signals();
  box.send("wake");
  assert.equal(await box.next(), "wake");
  const asked = box.next();
  box.send("wake");
  assert.equal(await asked, "wake");
  box.send("wake");
  box.send("closed");
  box.send("wake");
  assert.equal(await box.next(), "closed");
  let isResolved = false;
  box.next().then(() => { isResolved = true; });
  await settle();
  assert.equal(isResolved, false);
});

function scheduleHost({ time = 100, armed = true, tick } = {}) {
  const box = signals();
  const host = { time, armed, log: [], calls: 0, befores: [], done: false };
  host.now = () => host.time;
  host.startWait = (ms) => {
    host.log.push(`wait:${ms}`);
    return { cancel: () => host.log.push("cancel") };
  };
  host.tick = async (fires, wasArmed, before) => {
    host.calls += 1;
    host.befores.push(before);
    if (tick) {
      const answer = tick(host, fires, wasArmed);
      if (answer !== undefined) return answer;
    }
    host.log.push(fires ? "fire" : "read");
    return host.armed;
  };
  host.send = async (when, reason = "wake") => {
    host.time = when;
    host.log.length = 0;
    box.send(reason);
    await settle();
    return [...host.log];
  };
  host.start = async () => {
    keepSchedule({
      tick: (...args) => host.tick(...args),
      next: box.next,
      startWait: (ms) => host.startWait(ms),
      failed: (error) => host.log.push(`failed:${error.message}`),
      now: () => host.now(),
    }).then(() => { host.done = true; });
    await settle();
    return [...host.log];
  };
  host.box = box;
  return host;
}

test("nothing waits while no task is on", async () => {
  const host = scheduleHost({ armed: false });
  assert.deepEqual(await host.start(), ["read"]);
  host.armed = true;
  assert.deepEqual(await host.send(200), ["read", "wait:899800"]);
});

test("one wait runs while a task is on, and the last task going ends it", async () => {
  const host = scheduleHost();
  assert.deepEqual(await host.start(), ["read", "wait:899900"]);
  assert.deepEqual(await host.send(5000), ["cancel", "read", "wait:895000"]);
  assert.deepEqual(await host.send(300000), ["cancel", "read", "wait:600000"]);
  host.armed = false;
  assert.deepEqual(await host.send(310000), ["cancel", "read"]);
});

test("a quarter hour fires once, whichever signal comes first in its minute", async () => {
  const onTime = scheduleHost();
  await onTime.start();
  assert.deepEqual(await onTime.send(Q + 50), ["cancel", "fire", "wait:899950"]);
  const late = scheduleHost();
  await late.start();
  assert.deepEqual(await late.send(Q + 20000), ["cancel", "fire", "wait:880000"]);
  assert.deepEqual(await late.send(Q + 30000), ["cancel", "read", "wait:870000"]);
});

test("a wait that ends early waits out the rest", async () => {
  const host = scheduleHost();
  await host.start();
  assert.deepEqual(await host.send(Q - 2), ["cancel", "read", "wait:2"]);
  assert.deepEqual(await host.send(Q), ["cancel", "fire", "wait:900000"]);
});

const moving = (from, to) => (host) => { if (host.time === from) host.time = to; };

test("a minute that begins during a tick is looked at at once", async () => {
  const before = scheduleHost({ tick: moving(Q - 100, Q + 100) });
  await before.start();
  assert.deepEqual(await before.send(Q - 100), ["cancel", "read", "wait:0"]);
  assert.deepEqual(await before.send(Q + 100), ["cancel", "fire", "wait:899900"]);
  const long = scheduleHost({ tick: moving(Q, Q + 70000) });
  await long.start();
  assert.deepEqual(await long.send(Q), ["cancel", "fire", "wait:0"]);
  assert.deepEqual(await long.send(Q + 70000), ["cancel", "read", "wait:830000"]);
});

test("the clock is read once before a tick and once after it", async () => {
  const counting = scheduleHost();
  let reads = 0;
  counting.now = () => { reads += 1; return counting.time; };
  await counting.start();
  assert.equal(reads, 2);
  await counting.send(200);
  assert.equal(reads, 4);
  const ticking = scheduleHost({ time: Q - 1 });
  ticking.now = () => { const time = ticking.time; ticking.time += 1; return time; };
  assert.deepEqual(await ticking.start(), ["read", "wait:0"]);
  const log = await ticking.send(ticking.time);
  assert.deepEqual(log.slice(0, 2), ["cancel", "fire"]);
  assert.match(log[2], /^wait:\d+$/);
});

test("a tick is given the clock value read before it", async () => {
  const host = scheduleHost({ tick: moving(Q, Q + 70000) });
  await host.start();
  await host.send(Q);
  assert.deepEqual(host.befores, [100, Q]);
});

test("a tick that could not read leaves the mod as it was", async () => {
  const asBefore = (host, fires, wasArmed) => {
    if (host.calls === 1) return undefined;
    host.log.push(fires ? "fire" : "read");
    return wasArmed;
  };
  const parked = scheduleHost({ armed: false, tick: asBefore });
  assert.deepEqual(await parked.start(), ["read"]);
  assert.deepEqual(await parked.send(200), ["read"]);
  const armed = scheduleHost({ tick: asBefore });
  assert.deepEqual(await armed.start(), ["read", "wait:899900"]);
  assert.deepEqual(await armed.send(Q), ["cancel", "fire", "wait:900000"]);
});

test("a task switched on while nothing waited does not start in that minute", async () => {
  const parked = scheduleHost({ armed: false });
  assert.deepEqual(await parked.start(), ["read"]);
  parked.armed = true;
  assert.deepEqual(await parked.send(Q + 20000), ["read", "wait:880000"]);
  assert.deepEqual(await parked.send(Q + 30000), ["cancel", "read", "wait:870000"]);
  const between = scheduleHost();
  await between.start();
  between.armed = false;
  assert.deepEqual(await between.send(5000), ["cancel", "read"]);
  between.armed = true;
  assert.deepEqual(await between.send(Q + 20000), ["read", "wait:880000"]);
});

test("quarter hours slept over are not caught up, and the next one is by the clock", async () => {
  const host = scheduleHost();
  await host.start();
  assert.deepEqual(await host.send(3 * Q + 10000), ["cancel", "fire", "wait:890000"]);
  assert.deepEqual(await host.send(3 * Q + 20000), ["cancel", "read", "wait:880000"]);
});

test("a clock that was set back is followed at the next signal", async () => {
  const host = scheduleHost({ time: 86_400_100 });
  assert.deepEqual(await host.start(), ["read", "wait:899900"]);
  assert.deepEqual(await host.send(200000), ["cancel", "read", "wait:700000"]);
  assert.deepEqual(await host.send(Q), ["cancel", "fire", "wait:900000"]);
});

test("a tick that throws is tried again at the next quarter hour, also while parked", async () => {
  const throwingOn = (call) => (host) => { if (host.calls === call) throw new Error("boom"); };
  const first = scheduleHost({ tick: throwingOn(1) });
  assert.deepEqual(await first.start(), ["failed:boom", "wait:899900"]);
  assert.deepEqual(await first.send(Q), ["cancel", "fire", "wait:900000"]);
  const parked = scheduleHost({ armed: false, tick: throwingOn(2) });
  assert.deepEqual(await parked.start(), ["read"]);
  assert.deepEqual(await parked.send(200), ["failed:boom", "wait:899800"]);
  assert.deepEqual(await parked.send(Q), ["cancel", "fire"]);
});

test("closing ends it", async () => {
  const host = scheduleHost();
  await host.start();
  assert.deepEqual(await host.send(5000, "closed"), ["cancel"]);
  assert.equal(host.done, true);
  assert.deepEqual(await host.send(6000), []);
  const during = scheduleHost({ tick: (it) => { if (it.time === Q - 100) { it.time = Q + 100; it.box.send("closed"); } } });
  await during.start();
  assert.deepEqual(await during.send(Q - 100), ["cancel", "read", "wait:0", "cancel"]);
  assert.equal(during.done, true);
});

const UNREADABLE = "scheduled-tasks.json could not be read: denied";
const PAUSED = (failure) => ({ title: "Scheduled tasks are paused", body: `Open Tasks after fixing the file. ${failure}`, level: "error" });
const NOT_READ = { title: "Scheduled tasks could not be read", body: `Reload Tasks to try again. ${UNREADABLE}`, level: "error" };

function tickHost(texts, results = {}, gone = { names: [], failures: {} }) {
  const log = { toasts: [], fired: [], pruned: [], fires: [], steps: [] };
  let turn = 0;
  const scheduler = ticker({
    read: async () => {
      log.steps.push("read");
      const text = texts[Math.min(turn, texts.length - 1)];
      turn += 1;
      if (text instanceof Error) throw text;
      return text;
    },
    fire: async (task) => {
      log.fired.push(task.name);
      log.steps.push(`fire ${task.name}`);
      return results[task.name] ?? { outcome: "started", terminal: "t1" };
    },
    prune: async (name) => { log.pruned.push(name); },
    post: (toast) => { log.toasts.push(toast); },
    record: (names, name, stored) => { log.fires.push({ names, name, stored }); },
    deleted: () => [...gone.names],
    remove: async (name) => {
      log.steps.push(`remove ${name}`);
      return gone.failures[name] ?? null;
    },
    forget: (name) => {
      log.steps.push(`forget ${name}`);
      gone.names = gone.names.filter((kept) => kept !== name);
    },
  });
  return { scheduler, log };
}
const denied = new Error("denied");
const bad = textOf(entry({ name: "b", schedule: { every: 20 } }), entry({ name: "a" }));
const B_TOAST = { title: "b is not scheduled", body: "Open Tasks after fixing the file. every must be 15, 30 or 60", level: "error" };

test("a file that cannot be read names its cause and reloading, once, and leaves the mod as it was", async () => {
  const { scheduler, log } = tickHost([denied]);
  assert.equal(await scheduler.tick(false, false, 0), false);
  assert.equal(await scheduler.tick(true, true, 0), true);
  assert.deepEqual(log.toasts, [NOT_READ]);
  assert.deepEqual(log.fired, []);
});

test("a broken file pauses the tasks, says so once, and is announced again after a repair", async () => {
  const { scheduler, log } = tickHost(["{", "{", textOf(entry()), "{"]);
  const armed = [];
  for (let turn = 0; turn < 4; turn += 1) armed.push(await scheduler.tick(false, true, 0));
  assert.deepEqual(armed, [false, false, true, false]);
  const paused = PAUSED("scheduled-tasks.json is not valid JSON");
  assert.deepEqual(log.toasts, [paused, paused]);
});

test("a tick that could not read keeps the problem keys and the names of the last one that read", async () => {
  const { scheduler, log } = tickHost([bad, denied, bad]);
  for (let turn = 0; turn < 3; turn += 1) await scheduler.tick(false, true, 0);
  assert.deepEqual(log.toasts, [B_TOAST, NOT_READ]);
  const unread = tickHost([bad, denied]).scheduler;
  await unread.tick(false, true, 0);
  await unread.tick(false, true, 0);
  assert.deepEqual(unread.names(), ["a"]);
});

test("a broken file keeps the names of the valid tasks", async () => {
  const { scheduler } = tickHost([bad, "{"]);
  await scheduler.tick(false, true, 0);
  await scheduler.tick(false, true, 0);
  assert.deepEqual(scheduler.names(), ["a"]);
});

test("a tick decides what is due by the time it is given", async () => {
  const text = textOf(entry({ name: "nine", schedule: { at: "09:00" } }), entry({ name: "hourly" }));
  const { scheduler, log } = tickHost([text]);
  await scheduler.tick(true, true, at(24, 9, 0, 59));
  assert.deepEqual(log.fired, ["nine", "hourly"]);
  await scheduler.tick(true, true, at(24, 10, 0));
  assert.deepEqual(log.fired, ["nine", "hourly", "hourly"]);
  await scheduler.tick(false, true, at(24, 11, 0));
  await scheduler.tick(true, true, at(24, 11, 15));
  assert.equal(log.fired.length, 3);
});

test("each fire is stored with its detail, posted, and followed by a prune only after a start", async () => {
  const names = ["go", "busy", "stuck", "gone"];
  const text = textOf(...names.map((name) => entry({ name })), entry({ name: "off", enabled: false }), entry({ name: "bad", folder: "x" }));
  const { scheduler, log } = tickHost([text], {
    busy: { outcome: "skipped", reason: "working", terminal: "t2" },
    stuck: { outcome: "skipped", reason: "blocked", terminal: "t3" },
    gone: { outcome: "failed", message: "The folder does not exist" },
  });
  const time = at(24, 9, 0);
  await scheduler.tick(true, true, time);
  const all = [...names, "off", "bad"];
  assert.deepEqual(log.fires, [
    { names: all, name: "go", stored: { at: time, outcome: "started", detail: null } },
    { names: all, name: "busy", stored: { at: time, outcome: "skipped", detail: "working" } },
    { names: all, name: "stuck", stored: { at: time, outcome: "skipped", detail: "blocked" } },
    { names: all, name: "gone", stored: { at: time, outcome: "failed", detail: "The folder does not exist" } },
  ]);
  assert.deepEqual(log.pruned, ["go"]);
  assert.deepEqual(log.toasts.map((toast) => toast.title), ["bad is not scheduled", "Started go", "stuck is waiting for you", "gone did not start"]);
});

test("the runs of a deleted task are removed once, before the file is read and anything fires", async () => {
  const gone = { names: ["sync", "old"], failures: {} };
  const { scheduler, log } = tickHost([textOf(entry())], {}, gone);
  await scheduler.tick(true, true, at(24, 9, 0));
  assert.deepEqual(log.steps, ["remove sync", "forget sync", "remove old", "forget old", "read", "fire sync"]);
  assert.deepEqual(log.toasts.map((toast) => toast.title), ["Started sync"]);
  log.steps.length = 0;
  await scheduler.tick(false, true, at(24, 9, 1));
  assert.deepEqual(log.steps, ["read"]);
});

test("a task deleted during another removal is taken before the file is read, and no name twice in a tick", async () => {
  const gone = { names: ["d"], failures: {} };
  const { scheduler, log } = tickHost([textOf(entry({ name: "c" }))], {}, gone);
  const tick = scheduler.tick(true, true, at(24, 9, 0));
  gone.names.push("c");
  await tick;
  assert.deepEqual(log.steps, ["remove d", "forget d", "remove c", "forget c", "read", "fire c"]);
  const kept = { names: ["d"], failures: {} };
  Object.defineProperty(kept, "names", { get: () => ["d"], set: () => {} });
  const stuck = tickHost([null], {}, kept);
  await stuck.scheduler.tick(false, false, 0);
  assert.deepEqual(stuck.log.steps, ["remove d", "forget d", "read"]);
});

test("the runs of a deleted task are removed also while the file cannot be read, and a failure is told once", async () => {
  const gone = { names: ["old", "older"], failures: { old: "boom" } };
  const { scheduler, log } = tickHost([denied], {}, gone);
  await scheduler.tick(false, false, 0);
  await scheduler.tick(false, false, 0);
  assert.deepEqual(log.steps, ["remove old", "forget old", "remove older", "forget older", "read", "read"]);
  assert.deepEqual(log.toasts, [{ title: "Runs of old were not removed", body: "They are left as sched-old in hc ls --all: boom", level: "error" }, NOT_READ]);
});

const fireTask = taskOf("sync", every(15), { folder: "~/repo" });
const fireHost = (get, over = {}) => hostWith({ get, run: printed({ address: "t9" }), ...over });

test("anything thrown inside a fire is a failed start", async () => {
  const result = await fire(fireHost(failed(3), { run: printed("not json") }).host, fireTask);
  assert.equal(result.outcome, "failed");
  assert.equal(typeof result.message, "string");
  assert.notEqual(result.message, "");
});

test("a fire starts the command in the folder with the prompt last", async () => {
  const prompt = "直近の変更を\n要約して \"quoted\"";
  const { host, calls } = fireHost(failed(3));
  assert.deepEqual(await fire(host, { ...fireTask, command: ["claude", "--model", "x"], prompt }), { outcome: "started", terminal: "t9" });
  assert.deepEqual(calls, [
    ["exec", "/bin/test", ["-d", "/h/repo"], { timeout: 5000 }],
    ["hc", ["get", "sched-sync", "--json"]],
    ["hc", ["run", "--json", "--bg", "--no-parent", "--no-notify", "--name", "sched-sync", "--cwd", "/h/repo", "--", "claude", "--model", "x", prompt]],
  ]);
});

test("a fire is skipped until the last run has stopped", async () => {
  const cases = [[{ state: "working" }, "working"], [{ state: "blocked" }, "blocked"], [null, "running"], [{ state: "starting" }, "running"]];
  for (const [status, reason] of cases) {
    const { host, hcCalls } = fireHost(printed({ address: "t5", state: "live", status }));
    assert.deepEqual(await fire(host, fireTask), { outcome: "skipped", reason, terminal: "t5" });
    assert.deepEqual([...hcCalls("kill"), ...hcCalls("run")], []);
  }
});

test("a fire ends a run that has stopped", async () => {
  for (const state of ["idle", "done", "error"]) {
    for (const kill of [printed(""), failed(1, "boom")]) {
      const { host, calls } = fireHost(printed({ address: "t5", state: "live", status: { state } }), { kill });
      assert.deepEqual(await fire(host, fireTask), { outcome: "started", terminal: "t9" });
      assert.deepEqual(calls.filter(([kind]) => kind === "hc").map(([, args]) => args.slice(0, 2)), [["get", "sched-sync"], ["kill", "sched-sync"], ["run", "--json"]]);
    }
  }
});

test("a finished record is not killed", async () => {
  const { host, hcCalls } = fireHost(printed({ address: "t5", state: "finished", status: null }));
  assert.equal((await fire(host, fireTask)).outcome, "started");
  assert.deepEqual(hcCalls("kill"), []);
  assert.equal(hcCalls("run").length, 1);
});

test("a missing folder starts nothing", async () => {
  const { host, calls } = fireHost(failed(3), { test: failed(1) });
  assert.deepEqual(await fire(host, fireTask), { outcome: "failed", message: "The folder does not exist" });
  assert.deepEqual(calls.filter(([kind]) => kind === "hc"), []);
});

test("a failed start reports what hc said", async () => {
  const message = async (run) => (await fire(fireHost(failed(3), { run }).host, fireTask)).message;
  assert.equal(
    await message(failed(1, '{"error":{"kind":"spawn_failed","message":"cannot start \\"claude\\": No such file or directory (os error 2)","hint":"x"}}')),
    'cannot start "claude": No such file or directory (os error 2)',
  );
  assert.equal(await message(failed(1, "boom\nmore")), "boom");
  assert.equal(await message(failed(2)), "hc exited with code 2");
  assert.equal(await message(() => { throw new Error("no hc"); }), "no hc");
});

test("each result has its toast", () => {
  const action = { name: "terminal.peek", args: { terminal: "t5" } };
  assert.deepEqual(toastOf("sync", { outcome: "started", terminal: "t5" }), { title: "Started sync", level: "info", timeout: 4000, action });
  assert.deepEqual(toastOf("sync", { outcome: "skipped", reason: "blocked", terminal: "t5" }), { title: "sync is waiting for you", body: "Its last run stopped at a question, so this run was skipped.", level: "warning", action });
  assert.deepEqual(toastOf("sync", { outcome: "skipped", reason: "running", terminal: "t5" }), { title: "sync is still running", body: "Its last run has not reported that it stopped, so this run was skipped.", level: "warning", action });
  assert.equal(toastOf("sync", { outcome: "skipped", reason: "working", terminal: "t5" }), null);
  assert.deepEqual(toastOf("sync", { outcome: "failed", message: "boom" }), { title: "sync did not start", body: "boom", level: "error" });
});

const LIVE_RUN = { address: "t3", state: "live", status: "working", startedAt: 300, endedAt: null, exitCode: null, reason: null, folder: "/h/repo" };
const ENDED_RUN = { address: "t1", state: "finished", status: null, startedAt: 100, endedAt: 200, exitCode: 0, reason: "exited", folder: "/h/repo" };
const RECORDS = {
  t1: { address: "t1", state: "finished", status: null, created_ms: 100, finished_ms: 200, exit_code: 0, reason: "exited", cwd: "/h/repo" },
  t3: { address: "t3", state: "live", status: { state: "working" }, created_ms: 300, finished_ms: null, exit_code: null, reason: null, cwd: "/h/repo" },
};
const LISTED = {
  terminals: [
    { address: "t1", name: "sched-sync", state: "finished" },
    { address: "vps/t9", name: "sched-sync", state: "live" },
    { address: "t2", name: "sched-other", state: "finished" },
    { address: "t3", name: "sched-sync", state: "live" },
  ],
  hidden_finished: 0,
};
const recordsAnswer = (records) => (args) => (records[args[1]] ? printed(records[args[1]]) : failed(3));

test("the runs of a task are its terminals on this machine, newest first", async () => {
  const { host, calls, hcCalls } = hostWith({ ls: printed(LISTED), get: recordsAnswer(RECORDS) });
  assert.deepEqual(await listRuns(host, "sync"), [LIVE_RUN, ENDED_RUN]);
  assert.deepEqual(calls[0], ["hc", ["ls", "--all", "--json"]]);
  assert.deepEqual(hcCalls("get").map((args) => args.join(" ")).sort(), ["get t1 --json", "get t3 --json"]);
  const partial = hostWith({ ls: printed(LISTED), get: recordsAnswer({ t3: RECORDS.t3 }) });
  assert.deepEqual(await listRuns(partial.host, "sync"), [LIVE_RUN]);
  await assert.rejects(listRuns(hostWith({ ls: failed(1, "boom") }).host, "sync"), { message: "boom" });
});

const manyRecords = Object.fromEntries([9, 8, 7, 6, 5, 4, 3, 2].map((number) => [`t${number}`, {
  address: `t${number}`, state: number === 9 ? "live" : "finished", status: null, created_ms: number * 100, finished_ms: number === 9 ? null : number * 100 + 50, exit_code: null, reason: null, cwd: "/h",
}]));
const manyHost = () => hostWith({
  ls: printed({ terminals: Object.keys(manyRecords).map((address) => ({ address, name: "sched-sync", state: manyRecords[address].state })) }),
  get: recordsAnswer(manyRecords),
});
const rejecting = { hc: async () => { throw new Error("no hc"); }, exec: async () => printed(""), home: "/h" };

test("only the newest ended runs are kept", async () => {
  const { host, hcCalls } = manyHost();
  const runs = await listRuns(host, "sync");
  assert.deepEqual(staleOf(runs, 5), ["t3", "t2"]);
  assert.deepEqual(staleOf(runs.slice(0, 6), 5), []);
  assert.deepEqual(staleOf(runs.slice(0, 2), 5), []);
  await prune(host, "sync");
  assert.deepEqual(hcCalls("rm"), [["rm", "t3"], ["rm", "t2"]]);
  await prune(rejecting, "sync");
});

test("deleting a task ends and removes its runs", async () => {
  const { host, hcCalls, calls } = hostWith({ ls: printed(LISTED), get: recordsAnswer(RECORDS) });
  await removeRuns(host, "sync");
  const changes = calls.filter(([, args]) => ["kill", "rm"].includes(args[0])).map(([, args]) => args);
  assert.deepEqual(changes, [["kill", "t3"], ["rm", "t3"], ["rm", "t1"]]);
  assert.deepEqual(hcCalls("kill"), [["kill", "t3"]]);
});

test("a run that cannot be ended or removed is reported, and the others still go", async () => {
  const live = hostWith({ ls: printed(LISTED), kill: failed(1, "still there"), rm: (args) => (args[1] === "t3" ? failed(1, '{"error":{"kind":"live","message":"t3 is live"}}') : printed("")) });
  assert.equal(await removeRuns(live.host, "sync"), "still there");
  assert.deepEqual(live.hcCalls("rm"), [["rm", "t3"], ["rm", "t1"]]);
  const kept = hostWith({ ls: printed(LISTED), rm: failed(1, "no rm") });
  assert.equal(await removeRuns(kept.host, "sync"), "no rm");
  assert.equal(await removeRuns(hostWith({ ls: failed(1, "boom") }).host, "sync"), "boom");
  assert.equal(await removeRuns(rejecting, "sync"), "no hc");
  const partly = hostWith({ ls: printed(LISTED), kill: () => { throw new Error("no kill"); } });
  assert.equal(await removeRuns(partly.host, "sync"), "no kill");
  assert.deepEqual(partly.hcCalls("rm"), [["rm", "t1"]]);
});

test("a run that ended or went by itself meanwhile is no failure", async () => {
  const ended = hostWith({ ls: printed(LISTED), kill: failed(1, "not live") });
  assert.equal(await removeRuns(ended.host, "sync"), null);
  const gone = hostWith({ ls: printed(LISTED), rm: failed(3, '{"error":{"kind":"not_found","message":"no terminal"}}') });
  assert.equal(await removeRuns(gone.host, "sync"), null);
});

const never = () => new Promise(() => {});
const held = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};

test("a removal within its time gives its own result", async () => {
  const waits = [];
  const sleep = (ms) => { waits.push(ms); return never(); };
  assert.equal(await removeInTime(hostWith({ ls: printed(LISTED) }).host, "sync", sleep), null);
  assert.equal(await removeInTime(hostWith({ ls: failed(1, "boom") }).host, "sync", sleep), "boom");
  assert.deepEqual(waits, [20_000, 20_000]);
});

test("a removal whose hc call does not come back is a failure once its time is over", async () => {
  for (const hanging of [{ ls: never }, { ls: printed(LISTED), kill: never }, { ls: printed(LISTED), rm: never }]) {
    assert.equal(await removeInTime(hostWith(hanging).host, "sync", settle), "hc did not answer within 20 seconds");
  }
});

test("a removal that is out of time ends and removes nothing more when its call comes back", async () => {
  const listing = held();
  const late = hostWith({ ls: () => listing.promise });
  await removeInTime(late.host, "sync", settle);
  listing.release(printed(LISTED));
  await settle();
  assert.deepEqual([...late.hcCalls("kill"), ...late.hcCalls("rm")], []);
  const killing = held();
  const half = hostWith({ ls: printed(LISTED), kill: () => killing.promise });
  await removeInTime(half.host, "sync", settle);
  killing.release(printed(""));
  await settle();
  assert.deepEqual(half.hcCalls("kill"), [["kill", "t3"]]);
  assert.deepEqual(half.hcCalls("rm"), []);
});

test("a run whose record cannot be read is removed with the others", async () => {
  const { host, hcCalls } = hostWith({ ls: printed(LISTED), get: failed(1, "boom") });
  assert.equal(await removeRuns(host, "sync"), null);
  assert.deepEqual(hcCalls("rm"), [["rm", "t3"], ["rm", "t1"]]);
});

test("a log is what the terminal kept, and names the session of a claude run", async () => {
  const { host, calls } = hostWith({ read: printed('{"complete":true,"how":"history","text":"a\\nb"}') });
  assert.deepEqual(await readLog(host, "t1"), { text: "a\nb", complete: true, session: null });
  assert.deepEqual(calls, [["hc", ["read", "t1", "--lines", "2000", "--json"]]]);
  const text = `\nResume this session with:\nclaude --resume ${SESSION}`;
  assert.deepEqual(await readLog(hostWith({ read: printed({ complete: false, how: "history", text }) }).host, "t1"), { text, complete: false, session: SESSION });
  const gone = hostWith({ read: failed(3, '{"error":{"kind":"not_found","message":"no terminal \\"t1\\"","hint":"x"}}') });
  await assert.rejects(readLog(gone.host, "t1"), { message: 'no terminal "t1"' });
});

test("a session id is the one in the last resume line", () => {
  assert.equal(sessionOf("x\nclaude --resume 11111111-1111-1111-1111-111111111111\ny\nclaude --resume 22222222-2222-2222-2222-222222222222\n"), "22222222-2222-2222-2222-222222222222");
  for (const text of ["claude --resume abc", "claude --resume", ""]) assert.equal(sessionOf(text), null);
});

test("a session opens in a tab here, or in a space of this machine", () => {
  const argv = ["claude", "--resume", SESSION];
  assert.deepEqual(resumeCommand(SESSION, "/h/repo", true), { name: "tab.new", args: { folder: "/h/repo", argv } });
  assert.deepEqual(resumeCommand(SESSION, "/h/repo", false), { name: "space.new", args: { folder: "/h/repo", argv, machine: "" } });
});

test("a run reads as its state, and an ended one as how it ended", () => {
  const now = at(24, 10, 0);
  const live = (status) => runText({ ...LIVE_RUN, status }, now);
  assert.deepEqual(["working", "blocked", "done", "idle", "error", null].map(live), ["working", "needs you", "finished", "idle", "error", "running"]);
  const ended = (over, seen = now) => runText({ ...ENDED_RUN, endedAt: at(24, 9, 20), ...over }, seen);
  assert.equal(ended({ reason: "killed", exitCode: 129 }), "ended 09:20");
  assert.equal(ended({ reason: "killed", exitCode: null }), "ended 09:20");
  assert.equal(ended({ reason: "exited", exitCode: 0 }), "exited 09:20");
  assert.equal(ended({ reason: "exited", exitCode: 3 }), "failed (3) 09:20");
  assert.equal(ended({ reason: "exited", exitCode: null }), "ended 09:20");
  assert.equal(ended({ reason: "killed", exitCode: 129 }, at(25, 10, 0)), "ended Nov 24 09:20");
});

test("a past time on another day carries its date", () => {
  const now = at(24, 10, 0);
  assert.equal(pastText(at(24, 9, 0), now), "09:00");
  assert.equal(pastText(at(23, 9, 0), now), "Nov 23 09:00");
  assert.equal(pastText(at(17, 9, 0), now), "Nov 17 09:00");
  assert.equal(pastText(at(3, 9, 5), now), "Nov 3 09:05");
});

test("fire state keeps one fire per listed task", () => {
  const [x, y, z] = [{ at: 1 }, { at: 2 }, { at: 3 }];
  assert.deepEqual(firesAfter({ a: x, gone: y }, ["a", "b"], "b", z), { a: x, b: z });
});

const form = (over = {}) => ({ name: "a", prompt: "p", folder: "~/a", command: "claude", kind: "every", every: 30, hour: "09", minute: 0, days: DAY_NAMES, ...over });

test("a form becomes an entry", () => {
  assert.deepEqual(entryOfForm(form({ every: 15, folder: " ~/a ", command: " claude " }), null), { name: "a", enabled: true, prompt: "p", folder: "~/a", command: "claude", schedule: { every: 15 } });
  const scheduleOf = (over) => entryOfForm(form({ kind: "daily", ...over }), null).schedule;
  assert.deepEqual(scheduleOf({ hour: "9", minute: 30, days: ["fri", "mon"] }), { at: "09:30", days: ["mon", "fri"] });
  assert.deepEqual(scheduleOf({ hour: "09", minute: 0 }), { at: "09:00" });
  const odd = entryOfForm(form({ kind: "daily", hour: " x" }), null);
  assert.equal(odd.schedule.at, "x:00");
  assert.equal(problemOf(odd, new Set()), "at must be a time on the quarter hour, like 09:30");
  const base = { name: "a", enabled: false, note: "mine", schedule: { every: 15 } };
  const edited = entryOfForm(form({ kind: "daily" }), base);
  assert.equal(edited.enabled, false);
  assert.equal(edited.note, "mine");
  assert.deepEqual(edited.schedule, { at: "09:00" });
});

test("only a changed form is a draft", () => {
  const f = form();
  assert.equal(draftOf(f, { ...f }), null);
  assert.deepEqual(draftOf(f, { ...f, prompt: "x" }), { ...f, prompt: "x" });
  const g = form({ days: ["mon", "fri"] });
  assert.equal(draftOf(g, { ...g, days: ["fri", "mon"] }), null);
  assert.deepEqual(draftOf(g, { ...g, days: ["mon"] }), { ...g, days: ["mon"] });
});

test("each form keeps its own draft", () => {
  const [x, y, z] = [form({ name: "x" }), form({ name: "y" }), form({ name: "z" })];
  assert.deepEqual(draftsAfter({ a: x }, "", y), { a: x, "": y });
  assert.deepEqual(draftsAfter({ a: x, "": y }, "a", null), { "": y });
  assert.deepEqual(draftsAfter({}, "a", null), {});
  assert.deepEqual(draftsFor({ a: x, gone: z, "": y }, ["a", "b"]), { a: x, "": y });
});

test("saving one task leaves the others as they are", () => {
  const entries = [entry({ name: "a" }), 7, entry({ name: "a", prompt: "second" }), entry({ name: "b" })];
  const changed = entry({ name: "a", prompt: "changed" });
  assert.deepEqual(withEntry(entries, "a", changed), [changed, ...entries.slice(1)]);
  assert.deepEqual(withEntry(entries, null, changed), [...entries, changed]);
  assert.deepEqual(withEntry(entries, "none", changed), [...entries, changed]);
  assert.deepEqual(withoutEntry(entries, "a"), entries.slice(1));
  assert.deepEqual(withoutEntry(entries, "none"), entries);
  assert.equal(fileText({ tasks: [], note: 1 }, [changed]), `${JSON.stringify({ tasks: [changed], note: 1 }, null, 2)}\n`);
});

test("a saved name is held against the entries before its own", () => {
  const entries = [entry({ name: "a" }), 7, entry({ name: "b" }), entry({ name: "a", prompt: "second" })];
  assert.deepEqual([...namesBefore(entries, entries[0])], []);
  assert.deepEqual([...namesBefore(entries, entries[2])], ["a"]);
  assert.deepEqual([...namesBefore(entries, null)], ["a", "b"]);
});

test("a valid task is saved although a later entry repeats its name", async () => {
  const text = textOf(entry({ name: "a" }), entry({ name: "a", prompt: "second" }));
  const { screen, cx, log } = screenWith(text, "a", { prompt: "changed" });
  screen.save(cx);
  await settle();
  assert.equal(screen.form, null);
  assert.deepEqual(JSON.parse(log.written).tasks.map((saved) => saved.prompt), ["changed", "second"]);
});

function screenWith(text, name, typed = {}, { write = async () => null } = {}) {
  const log = { shared: {}, sets: [], written: null, hc: [] };
  globalThis.herdrStub = {
    appHome: () => "/app",
    shared: (key) => log.shared[key],
    setShared: (key, value) => { log.shared[key] = value; log.sets.push(key); },
    writeTextFile: async (_path, next) => { await write(); log.written = next; },
  };
  const screen = Object.create(ScheduledTasks.prototype);
  const base = JSON.parse(text).tasks.find((found) => found.name === name);
  const fields = { name, prompt: base.prompt, folder: base.folder, command: "claude", hour: "09", ...typed };
  Object.assign(screen, {
    role: "screen", closed: false, mode: "form", loads: 0, loading: false, writing: false, busy: null, saveError: null, cursor: name,
    loaded: { ...parseFile(text), text, isRead: true },
    host: { exec: async () => printed(""), hc: async (args) => { log.hc.push(args); return printed({ terminals: [] }); }, home: "/h" },
    fields: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { value: () => value }])),
    form: { key: name, base, pristine: form({ name }), error: null, confirming: true, done: false, kind: "every", every: 30, minute: 0, days: DAY_NAMES },
    scroll: { scroll_to_item() {} },
    handle: { focus() {} },
  });
  const cx = { notify() {}, spawn: (work) => { work(cx); } };
  return { screen, cx, log };
}

test("deleting a task hands its name over before the change is announced, and shows the list at once", async () => {
  const { screen, cx, log } = screenWith(textOf(entry({ name: "a" }), entry({ name: "b" })), "a");
  screen.remove(cx);
  await settle();
  assert.deepEqual(JSON.parse(log.written).tasks.map((kept) => kept.name), ["b"]);
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], ["a"]);
  assert.ok(log.sets.indexOf("scheduled-tasks.deleted") < log.sets.indexOf("scheduled-tasks.changed"));
  assert.deepEqual(log.hc, []);
  assert.equal(screen.mode, "list");
  assert.equal(screen.form, null);
});

test("closing the popup during the write of a Delete still hands the name over", async () => {
  let finish;
  const { screen, cx, log } = screenWith(textOf(entry({ name: "a" })), "a", {}, { write: () => new Promise((resolve) => { finish = resolve; }) });
  screen.remove(cx);
  await settle();
  await screen.close();
  assert.equal(log.shared["scheduled-tasks.deleted"], undefined);
  finish();
  await settle();
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], ["a"]);
  assert.deepEqual(log.shared["scheduled-tasks.drafts"] ?? {}, {});
});

test("a Delete whose write is rejected hands nothing over", async () => {
  const { screen, cx, log } = screenWith(textOf(entry({ name: "a" })), "a", {}, { write: async () => { throw new Error("stale"); } });
  globalThis.herdrStub.readTextFile = async () => textOf(entry({ name: "a" }));
  screen.remove(cx);
  await settle();
  assert.equal(log.shared["scheduled-tasks.deleted"], undefined);
  assert.equal(screen.form.error, "Could not save: stale");
  assert.equal(screen.form.confirming, false);
});

function buttonWith(log, { hc, sleep = never, file = null }) {
  const button = Object.create(ScheduledTasks.prototype);
  Object.assign(log, { calls: [], toasts: [], waits: [] });
  Object.assign(globalThis.herdrStub, {
    props: () => ({ button: true }),
    checking: () => false,
    home: () => "/h",
    notify: (toast) => { log.toasts.push(toast); },
    readTextFile: async () => file,
    hc: async (args) => { log.calls.push(args); return hc(args); },
  });
  const cx = { notify() {}, sleep, timer: { after: (ms) => { log.waits.push(ms); return { cancel() {} }; } }, spawn: (work) => { work(cx); } };
  button.init(undefined, cx);
  return button;
}

const listedAs = (...names) => printed({ terminals: names.map((name, index) => ({ address: `t${index + 1}`, name: `sched-${name}`, state: "finished" })) });
const answer = (answers) => (args) => answers[args[0]] ?? printed("");

test("the button removes the runs of every task the screen deleted, once", async () => {
  const { screen, cx, log } = screenWith(textOf(entry({ name: "a" }), entry({ name: "b" })), "a");
  for (const name of ["a", "b", "a"]) {
    screen.form = { key: name, base: null, confirming: true, error: null, done: false };
    screen.remove(cx);
    await settle();
  }
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], ["b", "a"]);
  log.shared["scheduled-tasks.fires"] = { a: { at: 1 }, b: { at: 2 }, c: { at: 3 } };
  const button = buttonWith(log, { hc: answer({ ls: listedAs("a", "b", "c") }) });
  await settle();
  const removed = () => log.calls.filter(([verb]) => verb === "rm");
  assert.deepEqual(removed(), [["rm", "t2"], ["rm", "t1"]]);
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], []);
  assert.deepEqual(log.shared["scheduled-tasks.fires"], { c: { at: 3 } });
  log.shared["scheduled-tasks.changed"] = "again";
  button.passChangeOn();
  await settle();
  assert.equal(removed().length, 2);
  assert.deepEqual(log.toasts, []);
});

test("the button takes a list of deleted names that is none as empty", async () => {
  for (const value of [undefined, null, "a", { a: 1 }]) {
    const { log } = screenWith(textOf(entry({ name: "a" })), "a");
    log.shared["scheduled-tasks.deleted"] = value;
    buttonWith(log, { hc: answer({ ls: listedAs("a") }), file: textOf(entry({ name: "a" })) });
    await settle();
    assert.deepEqual({ calls: log.calls, toasts: log.toasts, waits: log.waits.length }, { calls: [], toasts: [], waits: 1 });
  }
});

test("the button goes on and forgets the name when a removal does not come back", async () => {
  const { log } = screenWith(textOf(entry({ name: "a" })), "a");
  log.shared["scheduled-tasks.deleted"] = ["a"];
  buttonWith(log, { hc: never, sleep: settle, file: textOf(entry({ name: "b" })) });
  await settle();
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], []);
  assert.deepEqual(log.toasts, [{ title: "Runs of a were not removed", body: "They are left as sched-a in hc ls --all: hc did not answer within 20 seconds", level: "error" }]);
  assert.equal(log.waits.length, 1);
});

test("forgetting a deleted task drops its last result and only its own name", () => {
  const log = screenWith(textOf(entry({ name: "a" })), "a").log;
  Object.assign(log.shared, { "scheduled-tasks.deleted": ["a", "b"], "scheduled-tasks.fires": { a: { at: 1 }, c: { at: 2 } } });
  forgetDeleted("a");
  assert.deepEqual(log.shared["scheduled-tasks.deleted"], ["b"]);
  assert.deepEqual(log.shared["scheduled-tasks.fires"], { c: { at: 2 } });
});

test("a copy that is gone does not report a fault when its names changed", () => {
  const button = Object.create(ScheduledTasks.prototype);
  button.names = [];
  button.takeNames(["a"], { notify: () => { throw new Error("stale"); } });
  assert.deepEqual(button.names, ["a"]);
});

test("folders are written with and without the home folder", () => {
  assert.deepEqual(["~", "~/a", "/x"].map((folder) => folderOf(folder, "/h")), ["/h", "/h/a", "/x"]);
  assert.deepEqual(["/h/a", "/h", "/hx"].map((path) => shortFolder(path, "/h")), ["~/a", "~", "/hx"]);
});

test("a schedule reads as a phrase", () => {
  assert.equal(scheduleText(every(15)), "every 15 min");
  assert.equal(scheduleText(every(60)), "every 60 min");
  assert.equal(scheduleText(daily(9, 0)), "daily 09:00");
  assert.equal(scheduleText(daily(9, 0, [1, 2, 3, 4, 5])), "weekdays 09:00");
  assert.equal(scheduleText(daily(9, 0, [0, 6])), "weekends 09:00");
  assert.equal(scheduleText(daily(9, 15, [1, 5])), "Mon Fri 09:15");
});

test("a time on another day names the day", () => {
  assert.equal(clockText(at(24, 14, 30), at(24, 9, 0)), "14:30");
  assert.equal(clockText(at(25, 9, 5), at(24, 9, 0)), "Wed 09:05");
});

test("the status column tells the latest", () => {
  const now = at(24, 10, 0);
  const started = { at: at(24, 9, 0), outcome: "started", detail: null };
  assert.equal(statusText({ status: "blocked" }, started, now), "needs you");
  assert.equal(statusText({ status: null }, started, now), "running");
  assert.equal(statusText(null, started, now), "ran 09:00");
  assert.equal(statusText(null, started, at(25, 10, 0)), "ran Nov 24 09:00");
  assert.equal(statusText(null, { ...started, outcome: "skipped" }, now), "skipped 09:00");
  assert.equal(statusText(null, null, now), "");
});

const terminalList = [
  { address: "t1", name: "sched-a", state: "finished", status: null },
  { address: "vps/t2", name: "sched-a", state: "live", status: "working" },
  { address: "t3", name: "sched-a", state: "live", status: "working" },
];

test("a live run is found by its terminal name on this machine", () => {
  assert.equal(liveOf(terminalList, "a"), terminalList[2]);
  assert.equal(liveOf(terminalList, "b"), null);
});

test("the button shows a dot only for a waiting run of a listed task", () => {
  const blocked = [{ address: "t3", name: "sched-a", state: "live", status: "blocked" }];
  assert.equal(needsYou(blocked, ["a"]), true);
  assert.equal(needsYou(terminalList, ["a"]), false);
  assert.equal(needsYou([{ ...blocked[0], address: "vps/t3" }], ["a"]), false);
  assert.equal(needsYou(blocked, ["b"]), false);
});

test("the cursor wraps and the list height is capped", () => {
  assert.equal(stepCursor(["a", "b"], "b", 1), "a");
  assert.equal(stepCursor(["a", "b"], null, -1), "b");
  assert.equal(stepCursor([], null, 1), null);
  assert.equal(listHeightOf(3, 460), 104);
  assert.equal(listHeightOf(100, 460), 460);
  assert.equal(listHeightOf(0, 460), 0);
});
