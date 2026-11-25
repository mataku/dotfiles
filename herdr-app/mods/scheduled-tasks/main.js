import { View, div, svg } from "gpui-kit";
import { Editor, EditorState, Input, InputState, ScrollHandle, Textarea, TextareaState, h_flex, v_flex } from "gpui-base";
import { appHome, checking, closeOverlay, exec, focused, hc, home, notify, props, readTextFile, run, setShared, settings, shared, spaces, terminals, theme, writeTextFile } from "herdr";

const MOD = "scheduled-tasks";
const FILE = "scheduled-tasks.json";
const CHANGED_KEY = "scheduled-tasks.changed";
const FIRES_KEY = "scheduled-tasks.fires";
const DELETED_KEY = "scheduled-tasks.deleted";
const DRAFTS_KEY = "scheduled-tasks.drafts";
const FIX_HINT = "Open Tasks after fixing the file.";
const RELOAD_HINT = "Reload Tasks to try again.";
const NO_FOLDER = "The folder does not exist";

const TEST = "/bin/test";
const CHECK_TIMEOUT_MS = 5_000;
const LOG_LINES = "2000";
const KEEP_RUNS = 5;
const REMOVE_LIMIT_MS = 20_000;
const STARTED_TOAST_MS = 4_000;
const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;

const NAME = /^[a-z0-9_-]{1,26}$/;
const AT = /^([01]\d|2[0-3]):(00|15|30|45)$/;
const RESUME = /claude --resume ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?![0-9a-f-])/g;
const INTERVALS = [15, 30, 60];
const QUARTERS = [0, 15, 30, 45];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STOPPED = new Set(["idle", "done", "error"]);
const STATE_WORDS = { working: "working", blocked: "needs you", done: "finished", idle: "idle", error: "error" };

const messageOf = (error) => String(error?.message ?? error);
const twoDigits = (value) => String(value).padStart(2, "0");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const recordOf = (value) => (isObject(value) ? value : {});
const ownOf = (record, key) => (Object.hasOwn(record, key) ? record[key] : null);
const nameOf = (entry) => (typeof entry?.name === "string" ? entry.name : undefined);
const namesOf = (entries) => entries.map(nameOf).filter((name) => name !== undefined);
const dayNumber = (name) => (DAYS.indexOf(name) + 1) % 7;
const terminalOf = (name) => `sched-${name}`;
const isLocal = (address) => !address.includes("/");
const wordsOf = (command) => command.split(/\s+/).filter(Boolean);

function scheduleProblem(schedule) {
  if (!isObject(schedule) || Object.hasOwn(schedule, "every") === Object.hasOwn(schedule, "at")) return "schedule needs either every or at";
  if (Object.hasOwn(schedule, "every") && !INTERVALS.includes(schedule.every)) return "every must be 15, 30 or 60";
  if (Object.hasOwn(schedule, "at") && !(typeof schedule.at === "string" && AT.test(schedule.at))) return "at must be a time on the quarter hour, like 09:30";
  const { days } = schedule;
  const hasValidDays = days === undefined || (Array.isArray(days) && days.length > 0 && days.every((day) => DAYS.includes(day)) && new Set(days).size === days.length);
  return hasValidDays ? null : "days must list some of mon, tue, wed, thu, fri, sat, sun";
}

export function problemOf(entry, taken) {
  if (!isObject(entry)) return "a task must be an object";
  const { name, enabled, prompt, folder, command } = entry;
  if (typeof name !== "string" || !NAME.test(name)) return "name must be 1 to 26 characters of a-z, 0-9, - and _";
  if (taken.has(name)) return "name is already used";
  if (enabled !== undefined && typeof enabled !== "boolean") return "enabled must be true or false";
  if (typeof prompt !== "string" || prompt.trim() === "") return "prompt must not be empty";
  if (prompt.startsWith("-")) return "prompt must not start with -";
  if (typeof folder !== "string" || !(folder === "~" || folder.startsWith("/") || folder.startsWith("~/"))) return "folder must start with / or ~/";
  if (command !== undefined) {
    const [program] = typeof command === "string" ? wordsOf(command) : [];
    if (program === undefined || program.startsWith("-")) return "command must name a program";
  }
  return scheduleProblem(entry.schedule);
}

function scheduleOf({ every, at, days = DAYS }) {
  if (every !== undefined) return { kind: "every", minutes: every };
  const [hour, minute] = at.split(":").map(Number);
  return { kind: "daily", hour, minute, days: days.map(dayNumber).sort((a, b) => a - b) };
}

const taskOf = ({ name, enabled = true, prompt, folder, command = "claude", schedule }) =>
  ({ name, enabled, prompt, folder, command: wordsOf(command), schedule: scheduleOf(schedule) });

export function parseFile(text) {
  const parsed = { failure: null, document: {}, entries: [], tasks: [], problems: [] };
  if (text === null || text.trim() === "") return parsed;
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return { ...parsed, failure: `${FILE} is not valid JSON` };
  }
  if (!isObject(document) || !Array.isArray(document.tasks)) return { ...parsed, document: recordOf(document), failure: `${FILE} must be an object with a tasks list` };
  const taken = new Set();
  const tasks = [];
  const problems = [];
  document.tasks.forEach((entry, index) => {
    const message = problemOf(entry, taken);
    const name = nameOf(entry);
    if (message === null) tasks.push(taskOf(entry));
    else problems.push({ index, name: name ?? null, message });
    if (name !== undefined) taken.add(name);
  });
  return { failure: null, document, entries: document.tasks, tasks, problems };
}

async function loadFile(read) {
  let text;
  try {
    text = await read();
  } catch (error) {
    return { ...parseFile(null), text: null, isRead: false, failure: `${FILE} could not be read: ${messageOf(error)}` };
  }
  return { ...parseFile(text), text, isRead: true };
}

const labelOf = ({ index, name }) => name ?? `#${index + 1}`;
const problemText = (problem) => `${labelOf(problem)}: ${problem.message}`;

export const problemKeys = (problems) => problems.map(problemText);

export function problemToast(before, problems) {
  const added = problems.filter((problem) => !before.includes(problemText(problem)));
  if (added.length === 0) return null;
  if (added.length === 1) return { title: `${labelOf(added[0])} is not scheduled`, body: `${FIX_HINT} ${added[0].message}`, level: "error" };
  return { title: `${added.length} tasks are not scheduled`, body: `${FIX_HINT} ${added.map(labelOf).join(", ")}`, level: "error" };
}

function failureToast({ failure, isRead }) {
  if (!isRead) return { title: "Scheduled tasks could not be read", body: `${RELOAD_HINT} ${failure}`, level: "error" };
  return { title: "Scheduled tasks are paused", body: `${FIX_HINT} ${failure}`, level: "error" };
}

export function isSlot(schedule, now) {
  const at = new Date(now);
  if (schedule.kind === "every") return at.getMinutes() % schedule.minutes === 0;
  return at.getHours() === schedule.hour && at.getMinutes() === schedule.minute && schedule.days.includes(at.getDay());
}

export function nextOf(schedule, now) {
  if (schedule.kind === "every") {
    let slot = now + msToNextQuarter(now);
    while (!isSlot(schedule, slot)) slot += QUARTER;
    return slot;
  }
  const today = new Date(now);
  for (let day = 0; ; day += 1) {
    const slot = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day, schedule.hour, schedule.minute).getTime();
    // Why isSlot and not the weekday alone: a time that the clock skips in spring comes out as another hour, at which the task is not due.
    if (slot > now && isSlot(schedule, slot)) return slot;
  }
}

export const dueTasks = (tasks, now) => tasks.filter((task) => task.enabled && isSlot(task.schedule, now));

export const msToNextQuarter = (now) => QUARTER - (now % QUARTER);

export const minuteOf = (now) => Math.floor(now / MINUTE);

export const isQuarterMinute = (now) => now % QUARTER < MINUTE;

export const isArmed = ({ tasks }) => tasks.some((task) => task.enabled);

export function signals() {
  let kept = null;
  let waiter = null;
  return {
    send(reason) {
      if (waiter !== null) {
        const resolve = waiter;
        waiter = null;
        resolve(reason);
      } else if (kept !== "closed") kept = reason;
    },
    next() {
      return new Promise((resolve) => {
        if (kept === null) {
          waiter = resolve;
          return;
        }
        const reason = kept;
        kept = null;
        resolve(reason);
      });
    },
  };
}

// Why the clock is read exactly twice in a turn: a quarter hour could begin between two further reads, be marked as looked at without a fire, and be lost.
export async function keepSchedule({ tick, next, startWait, failed, now }) {
  let served = null;
  let armed = false;
  for (;;) {
    const before = now();
    const fires = armed && isQuarterMinute(before) && minuteOf(before) !== served;
    served = minuteOf(before);
    try {
      armed = await tick(fires, armed, before);
    } catch (error) {
      failed(error);
      armed = true;
    }
    const after = now();
    // Why a wait of 0 and not continue: every turn must pass the timer and the mailbox, or a closed or replaced copy could fire once more.
    const wait = armed ? startWait(minuteOf(after) !== served ? 0 : msToNextQuarter(after)) : null;
    const reason = await next();
    wait?.cancel();
    if (reason === "closed") return;
  }
}

const leftoverToast = (name, message) => ({ title: `Runs of ${name} were not removed`, body: `They are left as ${terminalOf(name)} in hc ls --all: ${message}`, level: "error" });

export function ticker({ read, fire, prune, post, record, deleted, remove, forget }) {
  let failure = null;
  let keys = [];
  let names = [];
  return {
    names: () => names,
    async tick(fires, wasArmed, now) {
      // Why in the tick and before the fires: next to a fire, or after one, it would end the run of a new task that took the deleted one's name.
      const taken = new Set();
      const nextDeleted = () => deleted().find((name) => !taken.has(name));
      // Why the names are read anew after each removal: one deleted meanwhile must go before the file is read, for the same reason.
      for (let name = nextDeleted(); name !== undefined; name = nextDeleted()) {
        taken.add(name);
        const message = await remove(name);
        forget(name);
        if (message !== null) post(leftoverToast(name, message));
      }
      const loaded = await loadFile(read);
      if (loaded.failure !== null && loaded.failure !== failure) post(failureToast(loaded));
      failure = loaded.failure;
      if (!loaded.isRead) return wasArmed;
      const toast = problemToast(keys, loaded.problems);
      keys = problemKeys(loaded.problems);
      if (toast !== null) post(toast);
      if (failure === null) names = loaded.tasks.map((task) => task.name);
      for (const task of fires ? dueTasks(loaded.tasks, now) : []) {
        const result = await fire(task);
        record(namesOf(loaded.entries), task.name, { at: now, outcome: result.outcome, detail: result.reason ?? result.message ?? null });
        const said = toastOf(task.name, result);
        if (said !== null) post(said);
        if (result.outcome === "started") await prune(task.name);
      }
      return isArmed(loaded);
    },
  };
}

export const folderOf = (folder, homeFolder) => (folder === "~" || folder.startsWith("~/") ? `${homeFolder}${folder.slice(1)}` : folder);

export const shortFolder = (path, homeFolder) => (path === homeFolder || path.startsWith(`${homeFolder}/`) ? `~${path.slice(homeFolder.length)}` : path);

function hcMessage({ code, stderr }) {
  try {
    const { message } = JSON.parse(stderr).error;
    if (typeof message === "string" && message !== "") return message;
  } catch {}
  return stderr.split("\n")[0].trim() || `hc exited with code ${code}`;
}

async function hcJson(host, args) {
  const result = await host.hc(args);
  if (result.code !== 0) throw new Error(hcMessage(result));
  return JSON.parse(result.stdout);
}

async function folderFailure(host, folder) {
  const { code } = await host.exec(TEST, ["-d", folder], { timeout: CHECK_TIMEOUT_MS });
  return code === 0 ? null : NO_FOLDER;
}

async function startRun(host, task) {
  const terminal = terminalOf(task.name);
  const folder = folderOf(task.folder, host.home);
  const failure = await folderFailure(host, folder);
  if (failure !== null) return { outcome: "failed", message: failure };
  const found = await host.hc(["get", terminal, "--json"]);
  const last = found.code === 0 ? JSON.parse(found.stdout) : null;
  if (last?.state === "live") {
    const state = last.status?.state;
    // Why a live terminal without a status is not ended: it is a program that still runs or an agent before its session, and every fire would cut it off.
    if (!STOPPED.has(state)) return { outcome: "skipped", reason: state === "working" || state === "blocked" ? state : "running", terminal: last.address };
    await host.hc(["kill", terminal]);
  }
  const { address } = await hcJson(host, ["run", "--json", "--bg", "--no-parent", "--no-notify", "--name", terminal, "--cwd", folder, "--", ...task.command, task.prompt]);
  return { outcome: "started", terminal: address };
}

export async function fire(host, task) {
  try {
    return await startRun(host, task);
  } catch (error) {
    return { outcome: "failed", message: messageOf(error) };
  }
}

export function toastOf(name, result) {
  if (result.outcome === "failed") return { title: `${name} did not start`, body: result.message, level: "error" };
  const action = { name: "terminal.peek", args: { terminal: result.terminal } };
  if (result.outcome === "started") return { title: `Started ${name}`, level: "info", timeout: STARTED_TOAST_MS, action };
  if (result.reason === "blocked") return { title: `${name} is waiting for you`, body: "Its last run stopped at a question, so this run was skipped.", level: "warning", action };
  if (result.reason === "running") return { title: `${name} is still running`, body: "Its last run has not reported that it stopped, so this run was skipped.", level: "warning", action };
  return null;
}

async function readRun(host, address) {
  try {
    const record = await hcJson(host, ["get", address, "--json"]);
    return {
      address, state: record.state, status: record.status?.state ?? null, startedAt: record.created_ms, endedAt: record.finished_ms,
      exitCode: record.exit_code, reason: record.reason, folder: record.cwd,
    };
  } catch {
    return null;
  }
}

async function terminalsNamed(host, name) {
  const { terminals: listed } = await hcJson(host, ["ls", "--all", "--json"]);
  return listed.filter((terminal) => terminal.name === terminalOf(name) && isLocal(terminal.address));
}

export async function listRuns(host, name) {
  const runs = await Promise.all((await terminalsNamed(host, name)).map(({ address }) => readRun(host, address)));
  return runs.filter((found) => found !== null).sort((a, b) => b.startedAt - a.startedAt);
}

export function staleOf(runs, keep) {
  return runs.filter((entry) => entry.state === "finished").slice(keep).map((entry) => entry.address);
}

export async function prune(host, name) {
  try {
    for (const address of staleOf(await listRuns(host, name), KEEP_RUNS)) await host.hc(["rm", address]);
  } catch {}
}

const isGone = ({ stderr }) => {
  try {
    return JSON.parse(stderr).error.kind === "not_found";
  } catch {
    return false;
  }
};

async function removeRun(host, { address, state }, limit) {
  const killed = state === "live" ? await host.hc(["kill", address]) : null;
  if (limit.isOver) return null;
  const removed = await host.hc(["rm", address]);
  // Why rm decides and not kill: a run can end by itself between the listing and the kill, and rm refuses one that still lives.
  if (removed.code === 0 || isGone(removed)) return null;
  return hcMessage(killed !== null && killed.code !== 0 ? killed : removed);
}

// Why the terminals are taken from ls and not from listRuns: that leaves out a terminal whose record cannot be read, and it would stay without a word.
export async function removeRuns(host, name, limit = { isOver: false }) {
  let found;
  try {
    found = await terminalsNamed(host, name);
  } catch (error) {
    return messageOf(error);
  }
  const messages = [];
  for (const terminal of found.sort((a, b) => Number(b.state === "live") - Number(a.state === "live"))) {
    // Why a removal out of time stops here: a listing that comes back late can hold the run of a new task of that name.
    if (limit.isOver) break;
    try {
      messages.push(await removeRun(host, terminal, limit));
    } catch (error) {
      messages.push(messageOf(error));
    }
  }
  return messages.find((message) => message !== null) ?? null;
}

// Why 20 seconds: two removals in a row that hang still leave a third of a quarter hour's first minute for its fires.
export function removeInTime(host, name, sleep) {
  const limit = { isOver: false };
  const timeout = async () => {
    await sleep(REMOVE_LIMIT_MS);
    limit.isOver = true;
    return `hc did not answer within ${REMOVE_LIMIT_MS / 1000} seconds`;
  };
  return Promise.race([removeRuns(host, name, limit), timeout()]);
}

export const sessionOf = (text) => [...text.matchAll(RESUME)].at(-1)?.[1] ?? null;

export async function readLog(host, address) {
  const { text, complete } = await hcJson(host, ["read", address, "--lines", LOG_LINES, "--json"]);
  return { text, complete, session: sessionOf(text) };
}

// Why machine is given: without it Herdr puts the new space on the shown space's machine, and the folder and the session are on this one.
export function resumeCommand(session, folder, local) {
  const argv = ["claude", "--resume", session];
  return local ? { name: "tab.new", args: { folder, argv } } : { name: "space.new", args: { folder, argv, machine: "" } };
}

const clockOf = (date) => `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

const isSameDay = (at, now) => new Date(at).toDateString() === new Date(now).toDateString();

export function clockText(at, now) {
  const date = new Date(at);
  return isSameDay(at, now) ? clockOf(date) : `${DAY_LABELS[date.getDay()]} ${clockOf(date)}`;
}

export function pastText(at, now) {
  const date = new Date(at);
  return isSameDay(at, now) ? clockOf(date) : `${MONTH_LABELS[date.getMonth()]} ${date.getDate()} ${clockOf(date)}`;
}

const stateWord = (status) => ownOf(STATE_WORDS, status) ?? "running";

export function runText(entry, now) {
  if (entry.state === "live") return stateWord(entry.status);
  const ended = pastText(entry.endedAt, now);
  // Why the reason comes before the exit code: a killed claude leaves a code too, and every run that was replaced would read as failed.
  if (entry.reason === "killed" || (entry.exitCode ?? null) === null) return `ended ${ended}`;
  return entry.exitCode === 0 ? `exited ${ended}` : `failed (${entry.exitCode}) ${ended}`;
}

export function statusText(live, fired, now) {
  if (live !== null) return stateWord(live.status);
  if (fired?.outcome === "started") return `ran ${pastText(fired.at, now)}`;
  return fired?.outcome === "skipped" ? `skipped ${pastText(fired.at, now)}` : "";
}

export function scheduleText(schedule) {
  if (schedule.kind === "every") return `every ${schedule.minutes} min`;
  const time = `${twoDigits(schedule.hour)}:${twoDigits(schedule.minute)}`;
  const days = schedule.days.join();
  if (schedule.days.length === DAYS.length) return `daily ${time}`;
  if (days === "1,2,3,4,5") return `weekdays ${time}`;
  if (days === "0,6") return `weekends ${time}`;
  const labels = DAYS.map(dayNumber).filter((day) => schedule.days.includes(day)).map((day) => DAY_LABELS[day]);
  return `${labels.join(" ")} ${time}`;
}

export const liveOf = (listed, name) =>
  listed.find((terminal) => terminal.name === terminalOf(name) && terminal.state === "live" && isLocal(terminal.address)) ?? null;

export const needsYou = (listed, names) => names.some((name) => liveOf(listed, name)?.status === "blocked");

export function firesAfter(fires, names, name, fired) {
  return { ...Object.fromEntries(Object.entries(fires).filter(([key]) => names.includes(key))), [name]: fired };
}

const orderedDays = (days) => DAYS.filter((day) => days.includes(day));

function scheduleOfForm({ kind, every, hour, minute, days }) {
  if (kind === "every") return { every };
  const typed = hour.trim();
  const at = `${/^\d{1,2}$/.test(typed) ? twoDigits(typed) : typed}:${twoDigits(minute)}`;
  return days.length === DAYS.length ? { at } : { at, days: orderedDays(days) };
}

export function entryOfForm(form, base) {
  return {
    ...base, name: form.name, enabled: base?.enabled ?? true, prompt: form.prompt, folder: form.folder.trim(), command: form.command.trim(), schedule: scheduleOfForm(form),
  };
}

const EMPTY_FORM = { name: "", prompt: "", folder: "", command: "claude", kind: "every", every: 30, hour: "09", minute: 0, days: DAYS };

function formOf({ name, prompt, folder, command = EMPTY_FORM.command, schedule }) {
  const form = { ...EMPTY_FORM, name, prompt, folder, command };
  if (schedule.every !== undefined) return { ...form, every: schedule.every };
  const [hour, minute] = schedule.at.split(":");
  return { ...form, kind: "daily", hour, minute: Number(minute), days: orderedDays(schedule.days ?? DAYS) };
}

const comparable = (form) => Object.keys(EMPTY_FORM).map((field) => String(field === "days" ? orderedDays(form.days) : form[field])).join("\u0000");

export const draftOf = (pristine, current) => (comparable(pristine) === comparable(current) ? null : current);

const withoutKey = (record, key) => Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

export const draftsAfter = (drafts, key, draft) => ({ ...withoutKey(drafts, key), ...(draft === null ? {} : { [key]: draft }) });

export const draftsFor = (drafts, names) => Object.fromEntries(Object.entries(drafts).filter(([key]) => key === "" || names.includes(key)));

const indexOfName = (entries, name) => entries.findIndex((entry) => nameOf(entry) === name);

export function withEntry(entries, name, entry) {
  const at = name === null ? -1 : indexOfName(entries, name);
  return at < 0 ? [...entries, entry] : entries.map((kept, index) => (index === at ? entry : kept));
}

export function withoutEntry(entries, name) {
  const at = indexOfName(entries, name);
  return at < 0 ? entries : entries.filter((_entry, index) => index !== at);
}

export const namesBefore = (entries, base) => new Set(namesOf(base === null ? entries : entries.slice(0, indexOfName(entries, base.name))));

export const fileText = (document, entries) => `${JSON.stringify({ ...document, tasks: entries }, null, 2)}\n`;

export function stepCursor(ids, cursor, step) {
  if (ids.length === 0) return null;
  const at = ids.indexOf(cursor);
  return ids[at < 0 ? (step > 0 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length];
}

const ROW_HEIGHT = 30;
const LIST_GAP = 1;
const LIST_PADDING = 6;
const LIST_MAX_HEIGHT = 460;

// Why the height is worked out here: a popup is as tall as what it holds, and a scrolling list with no height of its own would push the key hints below the popup's edge.
export function listHeightOf(count, max) {
  return count === 0 ? 0 : Math.min(max, count * ROW_HEIGHT + (count - 1) * LIST_GAP + LIST_PADDING * 2);
}

const ICON = "mods/scheduled-tasks/clock.svg";
const ICONS = { reload: "mods/simulators/icons/reload.svg", start: "mods/simulators/icons/play.svg", stop: "mods/simulators/icons/stop.svg" };
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 90;
const LOG_HEIGHT = 380;
const PROMPT_HEIGHT = 104;
const FIELD_HEIGHT = 30;
const LABEL_WIDTH = 70;
const COLUMN_GAP = 8;
const COLUMNS = { prompt: 170, schedule: 120, next: 72, status: 108 };
const COLUMNS_WIDTH = Object.values(COLUMNS).reduce((sum, width) => sum + width, 0) + COLUMN_GAP * (Object.keys(COLUMNS).length - 1);
const RUN_WIDTH = 220;

const stopPress = (_event, cx) => cx.stop_propagation();
const settingsFile = () => `${appHome()}/${FILE}`;
const readSettings = () => readTextFile(settingsFile());
const announceChange = () => setShared(CHANGED_KEY, Date.now());
const readDrafts = () => recordOf(shared(DRAFTS_KEY));
const changeOf = () => shared(CHANGED_KEY) ?? null;

function dropDraft(key) {
  if (Object.hasOwn(readDrafts(), key)) setShared(DRAFTS_KEY, draftsAfter(readDrafts(), key, null));
}

const readFires = () => recordOf(shared(FIRES_KEY));
const readDeleted = () => (Array.isArray(shared(DELETED_KEY)) ? shared(DELETED_KEY) : []);
const withoutName = (names, name) => names.filter((kept) => kept !== name);

const handOver = (name) => setShared(DELETED_KEY, [...withoutName(readDeleted(), name), name]);

export function forgetDeleted(name) {
  setShared(DELETED_KEY, withoutName(readDeleted(), name));
  setShared(FIRES_KEY, withoutKey(readFires(), name));
}

export default class ScheduledTasks extends View {
  init(_props, cx) {
    this.role = props()?.button ? "button" : "screen";
    this.closed = false;
    this.form = null;
    if (this.role === "button") this.initButton(cx);
    else this.initScreen(cx);
  }

  async close() {
    this.closed = true;
    this.box?.send("closed");
    if (this.form === null || this.form.done) return;
    const { key, pristine } = this.form;
    const draft = draftOf(pristine, this.values());
    if (draft === null) dropDraft(key);
    else setShared(DRAFTS_KEY, draftsAfter(readDrafts(), key, draft));
  }

  initButton(cx) {
    this.names = [];
    this.fault = null;
    this.box = signals();
    this.seenChange = changeOf();
    if (checking()) return;
    const host = { hc, exec, home: home() };
    cx.spawn((cx) => {
      const scheduler = ticker({
        read: readSettings,
        fire: (task) => fire(host, task),
        prune: (name) => prune(host, name),
        post: notify,
        record: (names, name, fired) => setShared(FIRES_KEY, firesAfter(readFires(), names, name, fired)),
        deleted: readDeleted,
        remove: (name) => removeInTime(host, name, (ms) => cx.sleep(ms)),
        forget: forgetDeleted,
      });
      return keepSchedule({
        tick: async (fires, wasArmed, before) => {
          const armed = await scheduler.tick(fires, wasArmed, before);
          this.fault = null;
          this.takeNames(scheduler.names(), cx);
          return armed;
        },
        next: this.box.next,
        startWait: (ms) => cx.timer.after(ms, () => this.box.send("wake")),
        failed: (error) => this.reportFault(messageOf(error)),
        now: Date.now,
      });
    });
  }

  takeNames(names, cx) {
    if (names.join() === this.names.join()) return;
    this.names = names;
    // Why a throw is dropped: it means that this copy was closed or replaced during the tick, which is no fault of the mod, and the loop ends at its timer.
    try {
      cx.notify();
    } catch {}
  }

  reportFault(body) {
    if (body === this.fault) return;
    this.fault = body;
    try {
      notify({ title: "Scheduled tasks hit an error", body, level: "error" });
    } catch {}
  }

  // Why the value is compared: render runs on every change of Herdr's live data, and each signal makes the scheduler read the file.
  passChangeOn() {
    const change = changeOf();
    if (change === this.seenChange) return;
    this.seenChange = change;
    this.box.send("wake");
  }

  initScreen(cx) {
    // Why the folder is read first: opening the popup can move the focus, and a new task takes the folder of the terminal the person was in.
    const space = spaces().find((entry) => entry.active);
    const where = space?.machine ? null : focused()?.cwd || space?.folder || null;
    this.host = { hc, exec, home: home() };
    this.emptyForm = { ...EMPTY_FORM, folder: where === null ? "" : shortFolder(where, home()) };
    this.mode = "list";
    this.loaded = null;
    this.loading = false;
    this.loads = 0;
    this.writing = false;
    this.busy = null;
    this.saveError = null;
    this.cursor = null;
    this.runs = null;
    this.log = null;
    this.scroll = ScrollHandle.new();
    this.runScroll = ScrollHandle.new();
    this.fields = {
      name: InputState.new({ placeholder: "daily-review" }),
      prompt: TextareaState.new({ rows: 5 }),
      folder: InputState.new({ placeholder: "~/src" }),
      command: InputState.new({ placeholder: "claude" }),
      hour: InputState.new({ placeholder: "09" }),
    };
    for (const field of ["name", "folder", "command", "hour"]) this.fields[field].on("submit", (_event, cx) => this.save(cx));
    this.output = EditorState.new({ readonly: true, line_numbers: false, folding: false });
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (checking()) return;
    this.load(cx);
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  canWrite() {
    return this.loaded !== null && this.loaded.failure === null && !this.writing;
  }

  load(cx) {
    if (this.writing) return;
    this.saveError = null;
    if (this.form !== null) this.form.error = null;
    this.loading = true;
    cx.spawn(async (cx) => {
      await this.read();
      if (!this.closed) cx.notify();
    });
  }

  async read() {
    const turn = ++this.loads;
    const loaded = await loadFile(readSettings);
    // Why the counter is checked: a reload or a write can come before an earlier load ends, and the older text must not replace the newer one.
    if (this.closed || turn !== this.loads) return;
    this.loading = false;
    this.adopt(loaded);
    announceChange();
  }

  adopt(loaded) {
    this.loaded = loaded;
    const names = loaded.tasks.map((task) => task.name);
    if (!names.includes(this.cursor)) this.cursor = names[0] ?? null;
    if (this.form !== null && loaded.failure === null) this.form.base = loaded.entries.find((entry) => this.form.key !== "" && nameOf(entry) === this.form.key) ?? null;
    if (this.form !== null && loaded.failure !== null) this.form.error = loaded.failure;
    if (loaded.failure !== null) return;
    const drafts = readDrafts();
    const kept = draftsFor(drafts, namesOf(loaded.entries));
    if (Object.keys(kept).length !== Object.keys(drafts).length) setShared(DRAFTS_KEY, kept);
  }

  beginWrite() {
    this.writing = true;
    this.loading = false;
    this.loads += 1;
  }

  // Why written runs before the change is announced: the scheduler must find the deleted name when the announcement wakes it.
  async write(entries, written = () => {}) {
    const text = fileText(this.loaded.document, entries);
    try {
      await writeTextFile(settingsFile(), text, this.loaded.text);
    } catch (error) {
      await this.read();
      return `Could not save: ${messageOf(error)}`;
    }
    written();
    announceChange();
    this.saveError = null;
    this.adopt({ ...parseFile(text), text, isRead: true });
    return null;
  }

  toggle(task, cx) {
    if (!task || !this.canWrite()) return;
    this.beginWrite();
    this.busy = task.name;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const { entries } = this.loaded;
        const entry = entries[indexOfName(entries, task.name)];
        this.saveError = await this.write(withEntry(entries, task.name, { ...entry, enabled: !task.enabled }));
      } finally {
        this.busy = null;
        this.writing = false;
        if (!this.closed) cx.notify();
      }
    });
  }

  openForm(name, cx) {
    if (!this.canWrite()) return;
    const key = name ?? "";
    const base = name === null ? null : (this.loaded.entries.find((entry) => nameOf(entry) === name) ?? null);
    const pristine = base === null ? this.emptyForm : formOf(base);
    const { prompt, folder, command, hour, ...filled } = { ...pristine, ...ownOf(readDrafts(), key) };
    this.form = { key, base, pristine, error: null, confirming: false, done: false, kind: filled.kind, every: filled.every, minute: filled.minute, days: filled.days };
    for (const [field, value] of Object.entries({ name: filled.name, prompt, folder, command, hour })) this.fields[field].set_value(value);
    this.mode = "form";
    (key === "" ? this.fields.name : this.fields.prompt).focus();
    cx.notify();
  }

  values() {
    const { key, kind, every, minute, days } = this.form;
    const typed = Object.fromEntries(Object.entries(this.fields).map(([field, state]) => [field, state.value()]));
    return { ...typed, name: key === "" ? typed.name : key, kind, every, minute, days };
  }

  leaveForm(cursor) {
    this.form = null;
    this.mode = "list";
    if (cursor !== null) this.cursor = cursor;
    this.revealCursor();
    this.handle.focus();
  }

  cancel(cx) {
    if (this.writing) return;
    dropDraft(this.form.key);
    this.leaveForm(null);
    cx.notify();
  }

  changeForm(change, cx) {
    Object.assign(this.form, change);
    cx.notify();
  }

  // Why the work runs in a spawned task: a handler's cx stops being valid when the handler returns, and the folder test and the write take time.
  submitForm(cx, work) {
    const { form } = this;
    this.beginWrite();
    form.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        form.error = await work(form);
      } catch (error) {
        form.error = messageOf(error);
      } finally {
        this.writing = false;
        if (!this.closed) cx.notify();
      }
    });
  }

  save(cx) {
    if (this.form === null || this.writing) return;
    const { failure, entries } = this.loaded;
    const { base } = this.form;
    const entry = entryOfForm(this.values(), base);
    const problem = failure ?? problemOf(entry, namesBefore(entries, base));
    if (problem !== null) {
      this.changeForm({ error: problem }, cx);
      return;
    }
    this.submitForm(cx, async (form) => {
      const missing = await folderFailure(this.host, folderOf(entry.folder, this.host.home));
      if (missing !== null || this.closed) return missing;
      const rejected = await this.write(withEntry(this.loaded.entries, base?.name ?? null, entry));
      if (rejected !== null) return this.loaded.failure ?? rejected;
      this.finishForm(form);
      if (!this.closed) this.leaveForm(entry.name);
      return null;
    });
  }

  remove(cx) {
    if (this.form === null || this.writing) return;
    if (this.loaded.failure !== null) {
      this.changeForm({ error: this.loaded.failure }, cx);
      return;
    }
    if (!this.form.confirming) {
      this.changeForm({ confirming: true }, cx);
      return;
    }
    this.submitForm(cx, async (form) => {
      const rejected = await this.write(withoutEntry(this.loaded.entries, form.key), () => handOver(form.key));
      if (rejected !== null) {
        form.confirming = false;
        return this.loaded.failure ?? rejected;
      }
      this.finishForm(form);
      if (!this.closed) this.leaveForm(null);
      return null;
    });
  }

  finishForm(form) {
    form.done = true;
    dropDraft(form.key);
  }

  openRuns(name, cx) {
    if (!name) return;
    this.mode = "runs";
    this.runs = { name, list: null, failure: null, loading: false, loads: 0, cursor: null };
    this.loadRuns(cx);
    cx.notify();
  }

  loadRuns(cx) {
    const { runs } = this;
    const turn = ++runs.loads;
    runs.loading = true;
    cx.spawn(async (cx) => {
      try {
        const list = await listRuns(this.host, runs.name);
        if (turn !== runs.loads) return;
        Object.assign(runs, { list, failure: null });
        if (!list.some((entry) => entry.address === runs.cursor)) runs.cursor = list[0]?.address ?? null;
      } catch (error) {
        if (turn === runs.loads) Object.assign(runs, { list: null, failure: messageOf(error) });
      } finally {
        if (turn === runs.loads) runs.loading = false;
        if (!this.closed) cx.notify();
      }
    });
  }

  openRun(entry, cx) {
    if (!entry) return;
    if (entry.state === "live") {
      this.dismiss();
      run("terminal.peek", { terminal: entry.address });
      return;
    }
    this.mode = "log";
    this.log = { run: entry, name: this.runs.name, kept: null, failure: null, loading: false, loads: 0, opening: false };
    this.output.set_value("");
    this.loadLog(cx);
    cx.notify();
  }

  loadLog(cx) {
    const { log } = this;
    const turn = ++log.loads;
    log.loading = true;
    cx.spawn(async (cx) => {
      try {
        const kept = await readLog(this.host, log.run.address);
        if (this.closed || this.log !== log || turn !== log.loads) return;
        Object.assign(log, { kept, failure: null });
        this.output.set_value(kept.text);
      } catch (error) {
        if (turn === log.loads) Object.assign(log, { kept: null, failure: messageOf(error) });
      } finally {
        if (turn === log.loads) log.loading = false;
        if (!this.closed) cx.notify();
      }
    });
  }

  resume(cx) {
    const { log } = this;
    if (!log?.kept?.session || log.opening) return;
    log.opening = true;
    log.failure = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const missing = await folderFailure(this.host, log.run.folder);
        // Why this is checked again: the person went back or dismissed the popup during the wait, so nothing may open any more.
        if (this.closed || this.log !== log) return;
        log.failure = missing;
        if (missing !== null) return;
        const space = spaces().find((entry) => entry.active);
        const command = resumeCommand(log.kept.session, log.run.folder, space !== undefined && !space.machine);
        this.dismiss();
        run(command.name, command.args);
      } catch (error) {
        log.failure = messageOf(error);
      } finally {
        log.opening = false;
        if (!this.closed) cx.notify();
      }
    });
  }

  goBack(cx) {
    if (this.mode === "log") {
      this.mode = "runs";
      this.log = null;
    } else {
      this.mode = "list";
      this.runs = null;
    }
    this.handle.focus();
    cx.notify();
  }

  reload(cx) {
    if (this.mode === "runs") this.loadRuns(cx);
    else if (this.mode === "log") this.loadLog(cx);
    else this.load(cx);
    cx.notify();
  }

  tasks() {
    return this.loaded?.tasks ?? [];
  }

  taskAtCursor() {
    return this.tasks().find((task) => task.name === this.cursor) ?? null;
  }

  revealCursor() {
    const at = this.tasks().findIndex((task) => task.name === this.cursor);
    if (at >= 0) this.scroll.scroll_to_item(at);
  }

  step(by, cx) {
    if (this.mode === "runs") {
      const addresses = (this.runs.list ?? []).map((entry) => entry.address);
      this.runs.cursor = stepCursor(addresses, this.runs.cursor, by);
      if (addresses.length > 0) this.runScroll.scroll_to_item(addresses.indexOf(this.runs.cursor));
    } else {
      this.cursor = stepCursor(this.tasks().map((task) => task.name), this.cursor, by);
      this.revealCursor();
    }
    cx.notify();
  }

  listKey(event, cx) {
    if (event.key === "enter") this.editAtCursor(cx);
    else if (event.keystroke === "space") this.toggle(this.taskAtCursor(), cx);
    else if (event.keystroke === "n") this.openForm(null, cx);
    else if (event.keystroke === "o") this.openRuns(this.taskAtCursor()?.name, cx);
    else return false;
    return true;
  }

  editAtCursor(cx) {
    const task = this.taskAtCursor();
    if (task !== null) this.openForm(task.name, cx);
  }

  runsKey(event, cx) {
    if (event.key === "enter") this.openRun(this.runs.list?.find((entry) => entry.address === this.runs.cursor), cx);
    else if (event.key === "left") this.goBack(cx);
    else return false;
    return true;
  }

  logKey(event, cx) {
    if (event.key === "enter") this.resume(cx);
    else if (event.key === "left") this.goBack(cx);
    else return false;
    return true;
  }

  handleKey(event, cx) {
    if (event.key === "escape") {
      this.dismiss();
      return true;
    }
    if (this.mode === "form") return false;
    if (this.mode === "log") return this.logKey(event, cx);
    if (event.key === "down") this.step(1, cx);
    else if (event.key === "up") this.step(-1, cx);
    else if (event.keystroke === "r") this.reload(cx);
    else return this.mode === "runs" ? this.runsKey(event, cx) : this.listKey(event, cx);
    return true;
  }

  renderHeader(t, title, status, loading) {
    return h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(12.5).font_semibold().text_color(t.foreground).child(title))
      .child(div().flex_none().text_size(11.5).text_color(t.dim).child(status))
      .child(div().id(`${MOD}-reload`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
        .text_color(t.muted).hover((style) => style.bg(t.hover).text_color(t.foreground))
        .tooltip("Reload")
        .on_click((_event, cx) => this.reload(cx))
        .child(loading ? svg(ICONS.reload).size(14).spin(900) : svg(ICONS.reload).size(14)));
  }

  renderFooter(t, links, hints) {
    const link = ({ id, label, perform }) => div().id(`${MOD}-${id}`).flex_none().text_color(t.muted).hover((style) => style.text_color(t.foreground))
      .on_click((_event, cx) => perform(cx)).child(label);
    return h_flex().h(28).px(14).gap(16).flex_none().items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
      .children([...links.map(link), ...hints]);
  }

  renderError(t, text) {
    return div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked).truncate().child(text);
  }

  renderNote(t, text) {
    return div().px(14).py(10).flex_none().text_size(12).text_color(t.dim).child(text);
  }

  renderRows(id, scroll, rows) {
    return v_flex().id(`${MOD}-${id}`).h(listHeightOf(rows.length, LIST_MAX_HEIGHT)).flex_none().p(LIST_PADDING).gap(LIST_GAP).overflow_y_scrollbar().track_scroll(scroll).children(rows);
  }

  renderRow(t, id, atCursor) {
    return h_flex().id(`${MOD}-row-${id}`).h(ROW_HEIGHT).pl(24).pr(8).gap(COLUMN_GAP).flex_none().items_center().rounded(6)
      .bg(atCursor ? t.selected : t.popover).hover((style) => style.bg(t.hover));
  }

  renderDot(t, active) {
    return div().size(7).flex_none().rounded(3.5).bg(active ? t.working : t.border);
  }

  renderName(t, active, name) {
    return div().flex_1().min_w(0).truncate().text_size(12.5).text_color(active ? t.foreground : t.muted).child(name);
  }

  renderTask(t, task, now) {
    const { name, enabled } = task;
    const isBusy = this.busy === name;
    const live = liveOf(terminals(), name);
    const fired = ownOf(readFires(), name);
    const didNotStart = live === null && fired?.outcome === "failed" && !isBusy;
    const hasDraft = Object.hasOwn(readDrafts(), name);
    const column = (width, color, text) => div().w(width).flex_none().truncate().text_size(11.5).text_color(color).child(text);
    const toRuns = (el) => el.id(`${MOD}-run-${name}`).on_mouse_down("left", stopPress)
      .on_click((_event, cx) => { cx.stop_propagation(); this.cursor = name; this.openRuns(name, cx); });
    const slot = div().size(24).flex_none().flex().items_center().justify_center();
    const row = this.renderRow(t, name, name === this.cursor)
      .on_click((_event, cx) => { this.cursor = name; this.openForm(name, cx); cx.notify(); })
      .child(this.renderDot(t, enabled))
      .child(this.renderName(t, enabled, name));
    const told = didNotStart
      ? [toRuns(column(COLUMNS_WIDTH, t.blocked, `did not start: ${fired.detail}`))]
      : [
        column(COLUMNS.prompt, hasDraft ? t.muted : t.dim, hasDraft ? "unsaved edit" : task.prompt.trim().split("\n")[0]),
        column(COLUMNS.schedule, t.muted, scheduleText(task.schedule)),
        column(COLUMNS.next, t.muted, enabled ? clockText(nextOf(task.schedule, now), now) : "off"),
        toRuns(column(COLUMNS.status, t.dim, isBusy ? "Saving…" : statusText(live, fired, now))),
      ];
    return row.children(told).child(isBusy ? slot.text_size(12).text_color(t.dim).frames(SPINNER, SPINNER_MS) : this.renderAction(t, task));
  }

  renderAction(t, task) {
    return div().id(`${MOD}-act-${task.name}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
      .border(1).border_color(t.border).text_color(t.muted)
      .hover((style) => style.bg(t.hover).text_color(t.foreground))
      .tooltip(task.enabled ? "Turn off" : "Turn on")
      .on_mouse_down("left", stopPress)
      .on_click((_event, cx) => { cx.stop_propagation(); this.toggle(task, cx); })
      .child(svg(task.enabled ? ICONS.stop : ICONS.start).size(11));
  }

  listStatus() {
    if (this.loaded === null) return "Loading…";
    if (this.loaded.failure !== null) return "";
    const tasks = this.tasks();
    return `${tasks.filter((task) => task.enabled).length} on · ${tasks.length} tasks`;
  }

  renderList(t, now) {
    const tasks = this.tasks();
    const { failure = null, problems = [] } = this.loaded ?? {};
    const errors = [failure, ...problems.map(problemText), this.saveError].filter((text) => text !== null);
    const isEmpty = this.loaded !== null && failure === null && tasks.length === 0 && problems.length === 0;
    const newLabel = Object.hasOwn(readDrafts(), "") ? "+ New task (unsaved)" : "+ New task";
    return [
      this.renderHeader(t, "Scheduled tasks", this.listStatus(), this.loading),
      ...errors.map((text) => this.renderError(t, text)),
      ...(isEmpty ? [this.renderNote(t, `No tasks yet. Press n to add one. They are kept in ${shortFolder(settingsFile(), home())}`)] : []),
      ...(tasks.length > 0 ? [this.renderRows("scroll", this.scroll, tasks.map((task) => this.renderTask(t, task, now)))] : []),
      this.renderFooter(t, failure === null && this.loaded !== null ? [{ id: "new", label: newLabel, perform: (cx) => this.openForm(null, cx) }] : [],
        ["↑↓  select", "⏎  edit", "space  on / off", "o  runs", "r  reload", "esc  close"]),
    ];
  }

  renderRuns(t, now) {
    const { name, list, failure, loading, cursor } = this.runs;
    const rows = (list ?? []).map((entry) => this.renderRow(t, entry.address, entry.address === cursor)
      .on_click((_event, cx) => { this.runs.cursor = entry.address; this.openRun(entry, cx); })
      .child(this.renderDot(t, entry.state === "live"))
      .child(this.renderName(t, entry.state === "live", pastText(entry.startedAt, now)))
      .child(div().w(RUN_WIDTH).flex_none().truncate().text_size(11.5).text_color(t.muted).child(runText(entry, now))));
    const status = list === null ? (failure === null ? "Loading…" : "") : `${list.length} runs`;
    return [
      this.renderHeader(t, `Runs of ${name}`, status, loading),
      ...(failure === null ? [] : [this.renderError(t, failure)]),
      ...(list !== null && rows.length === 0 ? [this.renderNote(t, "No runs yet")] : []),
      ...(rows.length > 0 ? [this.renderRows("runs-scroll", this.runScroll, rows)] : []),
      this.renderFooter(t, [this.backLink()], ["↑↓  select", "⏎  open", "r  reload", "esc  close"]),
    ];
  }

  backLink() {
    return { id: "back", label: "← Back", perform: (cx) => this.goBack(cx) };
  }

  logNote({ session, complete }) {
    if (session !== null) return "This run was a Claude Code session. Press ⏎ to open it in a new tab.";
    return complete === false ? "Only the end of the output was kept." : null;
  }

  renderLog(t, now) {
    const { run: entry, name, kept, failure, loading } = this.log;
    const font = settings();
    const note = kept === null ? null : this.logNote(kept);
    const links = kept?.session ? [this.backLink(), { id: "resume", label: "Resume session", perform: (cx) => this.resume(cx) }] : [this.backLink()];
    return [
      this.renderHeader(t, `${name} · ${pastText(entry.startedAt, now)}`, loading ? "Loading…" : runText(entry, now), loading),
      ...(failure === null ? [] : [this.renderError(t, failure)]),
      ...(kept?.text === "" ? [this.renderNote(t, "No output")] : []),
      ...(kept !== null && kept.text !== "" ? [div().h(LOG_HEIGHT).flex_none().child(Editor.new(this.output).font_family(font.font_family).text_size(font.font_size).size_full())] : []),
      ...(note === null ? [] : [this.renderNote(t, note)]),
      this.renderFooter(t, links, ["esc  close"]),
    ];
  }

  renderField(t, state) {
    return h_flex().h(FIELD_HEIGHT).px(10).flex_1().min_w(0).items_center().rounded(6).border(1).border_color(t.border).bg(t.background)
      .child(Input.new(state).flex_1().h_full().text_size(12.5).text_color(t.foreground));
  }

  renderLine(t, label, controls) {
    return h_flex().gap(10).flex_none().items_center()
      .child(div().w(LABEL_WIDTH).flex_none().text_size(11.5).text_color(t.dim).child(label))
      .children(controls);
  }

  renderButtonLike(t, id, label, isOn, perform) {
    return div().id(`${MOD}-${id}`).h(24).px(10).flex_none().flex().items_center().rounded(5)
      .border(1).border_color(isOn ? t.accent : t.border).bg(isOn ? t.selected : t.popover)
      .text_size(11.5).text_color(isOn ? t.foreground : t.muted)
      .hover((style) => style.bg(t.hover).text_color(t.foreground))
      .on_click((_event, cx) => perform(cx))
      .child(label);
  }

  renderChips(t, field, choices) {
    return choices.map(({ value, label }) => this.renderButtonLike(t, `${field}-${value}`, label, this.form[field] === value, (cx) => this.changeForm({ [field]: value }, cx)));
  }

  toggleDay(day, cx) {
    const { days } = this.form;
    this.changeForm({ days: days.includes(day) ? days.filter((kept) => kept !== day) : orderedDays([...days, day]) }, cx);
  }

  renderSchedule(t) {
    const { kind, days } = this.form;
    const choice = this.renderLine(t, "Schedule", this.renderChips(t, "kind", [{ value: "every", label: "Every" }, { value: "daily", label: "Daily" }]));
    if (kind === "every") return [choice, this.renderLine(t, "Every", this.renderChips(t, "every", INTERVALS.map((value) => ({ value, label: `${value} min` }))))];
    const hour = h_flex().w(56).flex_none().child(this.renderField(t, this.fields.hour));
    const minutes = this.renderChips(t, "minute", QUARTERS.map((value) => ({ value, label: `:${twoDigits(value)}` })));
    const weekdays = DAYS.map((day) => this.renderButtonLike(t, `day-${day}`, DAY_LABELS[dayNumber(day)], days.includes(day), (cx) => this.toggleDay(day, cx)));
    return [choice, this.renderLine(t, "Time", [hour, ...minutes]), this.renderLine(t, "Days", weekdays)];
  }

  deleteLabel() {
    if (!this.form.confirming) return "Delete";
    return liveOf(terminals(), this.form.key) === null ? "Click again to delete it and its runs" : "Click again to end its run and delete it";
  }

  renderForm(t) {
    const { key, error } = this.form;
    const isNew = key === "";
    const name = isNew ? this.renderField(t, this.fields.name) : div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(key);
    const prompt = Textarea.new(this.fields.prompt).flex_1().min_w(0).h(PROMPT_HEIGHT).px(10).py(6).rounded(6).border(1).border_color(t.border).bg(t.background).text_size(12.5).text_color(t.foreground);
    const buttons = h_flex().gap(8).flex_none().items_center()
      .child(this.renderButtonLike(t, "save", this.writing ? "Saving…" : "Save", true, (cx) => this.save(cx)))
      .child(this.renderButtonLike(t, "cancel", "Cancel", false, (cx) => this.cancel(cx)))
      .when(!isNew, (row) => row.child(div().flex_1()).child(this.renderButtonLike(t, "delete", this.deleteLabel(), false, (cx) => this.remove(cx))));
    return [
      this.renderHeader(t, isNew ? "New task" : `Edit ${key}`, "", this.loading),
      ...(error === null ? [] : [this.renderError(t, error)]),
      v_flex().px(14).py(10).gap(8).flex_none()
        .child(this.renderLine(t, "Name", [name]))
        .child(this.renderLine(t, "Prompt", [prompt]))
        .child(this.renderLine(t, "Folder", [this.renderField(t, this.fields.folder)]))
        .child(this.renderLine(t, "Command", [this.renderField(t, this.fields.command)]))
        .children(this.renderSchedule(t))
        .child(buttons),
      this.renderFooter(t, [], ["esc  close"]),
    ];
  }

  renderScreen(t) {
    const now = Date.now();
    const content = this.mode === "form" ? this.renderForm(t)
      : this.mode === "runs" ? this.renderRuns(t, now)
        : this.mode === "log" ? this.renderLog(t, now) : this.renderList(t, now);
    return v_flex().id(`${MOD}-root`).track_focus(this.handle).w_full().min_h(0).bg(t.popover).text_color(t.foreground)
      .on_key_down((event, cx) => { if (this.handleKey(event, cx)) cx.stop_propagation(); })
      .children(content);
  }

  renderButton(t) {
    this.passChangeOn();
    const isWaiting = needsYou(terminals(), this.names);
    return h_flex().size_full().pr(4).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id(`${MOD}-toggle`).relative().h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(t.chrome).text_color(isWaiting ? t.foreground : t.muted)
        .hover((style) => style.bg(t.hover)).on_mouse_down("left", stopPress)
        .on_click(() => run("mod.open", { name: MOD }))
        .child(svg(ICON).size(14))
        .child("Tasks")
        .when(isWaiting, (el) => el.child(div().absolute().top(4).right(1).size(6).rounded(3).bg(t.blocked))));
  }

  render() {
    const t = theme();
    return this.role === "button" ? this.renderButton(t) : this.renderScreen(t);
  }
}
