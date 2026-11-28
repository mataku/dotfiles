const MAX_TEXT = 300;
const WEB_URL = /^https?:\/\/[^\s]+$/;

const textOf = (value) => (typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "");
const timeOf = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function toItem(source, fields) {
  const id = textOf(fields?.id);
  const title = textOf(fields?.title);
  const from = textOf(source);
  if (id === "" || title === "" || from === "") return null;
  const url = textOf(fields.url);
  return {
    source: from,
    id,
    title,
    context: textOf(fields.context),
    reason: textOf(fields.reason),
    url: WEB_URL.test(url) ? url : null,
    updatedAt: timeOf(fields.updatedAt),
  };
}

export const keyOf = (item) => `${item.source}:${item.id}`;

const isDone = (item, done) => typeof done[keyOf(item)] === "number" && done[keyOf(item)] >= item.updatedAt;

export const pending = (items, done) => items.filter((item) => !isDone(item, done)).sort((a, b) => b.updatedAt - a.updatedAt);

export function pruneDone(done, items) {
  const keys = new Set(items.map(keyOf));
  return Object.fromEntries(Object.entries(done).filter(([key]) => keys.has(key)));
}

export function mergeResults(previous, results, now) {
  const loaded = new Set(results.filter((result) => Array.isArray(result.items)).map((result) => result.source));
  const reported = new Set(results.map((result) => result.source));
  const kept = previous.items.filter((item) => !loaded.has(item.source));
  const fresh = results.flatMap((result) => (Array.isArray(result.items) ? result.items : []));
  const errors = Object.fromEntries([
    ...Object.entries(previous.errors).filter(([source]) => !reported.has(source)),
    ...results.filter((result) => !Array.isArray(result.items)).map((result) => [result.source, textOf(result.error) || "failed"]),
  ]);
  return { items: [...kept, ...fresh], errors, fetchedAt: now };
}

// Why this exists: a load replaces only the sources that answered, so the items of a source taken out of SOURCES would otherwise stay forever.
export function forSources(state, ids) {
  return {
    items: state.items.filter((item) => ids.includes(item.source)),
    errors: Object.fromEntries(Object.entries(state.errors).filter(([source]) => ids.includes(source))),
    fetchedAt: state.fetchedAt,
  };
}

export function readState(value) {
  const stored = isRecord(value) ? value : {};
  const items = Array.isArray(stored.items) ? stored.items.map((entry) => (isRecord(entry) ? toItem(entry.source, entry) : null)).filter(Boolean) : [];
  const errors = isRecord(stored.errors) ? Object.fromEntries(Object.entries(stored.errors).filter(([, message]) => typeof message === "string")) : {};
  return { items, errors, fetchedAt: timeOf(stored.fetchedAt) || null };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function ageOf(at, now) {
  if (timeOf(at) === 0) return "";
  const age = now - at;
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  return `${Math.floor(age / DAY)}d`;
}

export function readDone(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, at]) => typeof at === "number" && Number.isFinite(at)));
}

const GITHUB = "github";
const REPO_URL = /^https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+$/;
const SUBJECT_PATH = /\/(pulls|issues|commits|releases)\/([^/]+)$/;
const LOAD_TIMEOUT_MS = 20000;
const REASONS = {
  review_requested: "review",
  mention: "mention",
  team_mention: "mention",
  assign: "assigned",
  author: "your thread",
  comment: "comment",
  ci_activity: "ci",
  state_change: "state",
  security_alert: "security",
};
const PAGES = {
  pulls: (number) => `/pull/${number}`,
  issues: (number) => `/issues/${number}`,
  commits: (sha) => `/commit/${sha}`,
  releases: () => "/releases",
};
const LISTS = { Discussion: "/discussions", CheckSuite: "/actions" };

export function htmlUrlOf(notification) {
  const repo = notification?.repository?.html_url;
  if (typeof repo !== "string" || !REPO_URL.test(repo)) return null;
  const subject = notification.subject ?? {};
  const [, kind, name] = (typeof subject.url === "string" ? subject.url.match(SUBJECT_PATH) : null) ?? [];
  if (kind) return repo + PAGES[kind](encodeURIComponent(name));
  return repo + (LISTS[subject.type] ?? "");
}

const reasonOf = (reason) => (typeof reason === "string" ? (REASONS[reason] ?? reason.replaceAll("_", " ")) : "");

export function parseNotifications(text) {
  const list = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("GitHub did not return a list of notifications");
  return list
    .filter((entry) => entry?.unread === true)
    .map((entry) =>
      toItem(GITHUB, {
        id: entry.id,
        title: entry.subject?.title,
        context: entry.repository?.full_name,
        reason: reasonOf(entry.reason),
        url: htmlUrlOf(entry),
        updatedAt: Date.parse(entry.updated_at),
      }))
    .filter(Boolean);
}

// Why a source names a program rather than loading by itself: nikol's exec answers with an event, not a promise, so the inbox runs every load and gathers the answers.
export const SOURCES = [
  {
    id: GITHUB,
    label: "GitHub",
    program: "gh",
    args: ["api", "notifications?per_page=50"],
    parse: parseNotifications,
  },
];

const messageOf = (error) => String(error?.message ?? error);

// Turns what a source's program printed into the result mergeResults takes.
export function resultOf(source, ended) {
  if (ended.error) return { source: source.id, error: ended.error === "not-found" ? `${source.program} is not installed` : `${source.program}: ${ended.error}` };
  if (ended.code !== 0) return { source: source.id, error: textOf(ended.stderr) || `${source.program} exited with ${ended.code}` };
  try {
    return { source: source.id, items: source.parse(ended.stdout) };
  } catch (error) {
    return { source: source.id, error: messageOf(error) };
  }
}

const SCUTIL = "/usr/sbin/scutil";
const NETWORK_TIMEOUT_MS = 5000;
const REACH = /^\s*REACH : flags \S+ \((Not )?Reachable/gm;

const reachOf = (text) => [...text.matchAll(REACH)].map((match) => match[1] === undefined);

export const isReachable = (text) => reachOf(text).some(Boolean);

// Why a failed or unreadable check counts as online: a wrong "offline" would stop the inbox for good while a wrong "online" costs one failed load.
export function isOnline(ended) {
  return ended.error !== null || ended.code !== 0 || reachOf(ended.stdout).length === 0 || isReachable(ended.stdout);
}

const POLL_MS = 5 * 60 * 1000;
const COPIED_MS = 1500;
const ROW_GAP = 8;
const STATE_FILE = "state.json";
const DONE_FILE = "done.json";
const SETTINGS_FILE = "settings.json";

const parsed = (text) => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const twoDigits = (value) => String(value).padStart(2, "0");
export const clockOf = (at) => `${twoDigits(new Date(at).getHours())}:${twoDigits(new Date(at).getMinutes())}`;
const labelOf = (source) => SOURCES.find((entry) => entry.id === source)?.label ?? source;

export function createInbox(nikol, now = () => Date.now()) {
  const { ui } = nikol;
  const model = {
    enabled: false,
    state: readState(null),
    done: {},
    offline: false,
    loading: false,
    reloadAgain: false,
    results: [],
    copied: null,
    poll: 0,
  };
  let tree = null;
  let badge;

  const waiting = () => pending(model.state.items, model.done);

  function save(file, value) {
    nikol.data.write(file, JSON.stringify(value));
  }

  function showBadge() {
    const shown = model.enabled && waiting().length > 0;
    if (shown === badge) return;
    badge = shown;
    nikol.button.badge(shown);
  }

  function schedule() {
    model.poll++;
    if (model.enabled) nikol.timer.after(POLL_MS, `poll:${model.poll}`);
  }

  function reload() {
    if (!model.enabled) return;
    if (model.loading) {
      model.reloadAgain = true;
      return;
    }
    model.loading = true;
    nikol.exec("network", SCUTIL, ["--nwi"], { timeout: NETWORK_TIMEOUT_MS });
  }

  function checked(ended) {
    model.offline = !isOnline(ended);
    if (model.offline) {
      finish();
      return;
    }
    model.results = [];
    SOURCES.forEach((source) => nikol.exec(`load:${source.id}`, source.program, source.args, { timeout: LOAD_TIMEOUT_MS }));
  }

  function loaded(id, ended) {
    const source = SOURCES.find((entry) => entry.id === id);
    if (!source) return;
    model.results.push(resultOf(source, ended));
    if (model.results.length < SOURCES.length) return;
    model.state = mergeResults(model.state, model.results, now());
    save(STATE_FILE, model.state);
    // Why only after every source loaded: a failed load keeps its old items, and pruning against a partial list would bring finished items back on the next success.
    if (model.results.every((result) => Array.isArray(result.items))) {
      const kept = pruneDone(model.done, model.state.items);
      if (Object.keys(kept).length !== Object.keys(model.done).length) {
        model.done = kept;
        save(DONE_FILE, kept);
      }
    }
    finish();
  }

  function finish() {
    model.loading = false;
    if (model.reloadAgain) {
      model.reloadAgain = false;
      reload();
      return;
    }
    schedule();
  }

  function switchTo(isOn) {
    if (isOn === model.enabled) return;
    model.enabled = isOn;
    save(SETTINGS_FILE, { enabled: isOn });
    if (isOn) reload();
    else model.poll++;
  }

  function markDone(key) {
    const item = model.state.items.find((candidate) => keyOf(candidate) === key);
    if (!item) return;
    model.done = { ...model.done, [key]: item.updatedAt };
    save(DONE_FILE, model.done);
  }

  function copy(key) {
    const item = model.state.items.find((candidate) => keyOf(candidate) === key);
    if (!item?.url) return;
    nikol.clipboard.write(item.url);
    model.copied = key;
    nikol.timer.after(COPIED_MS, `copied:${key}`);
  }

  function onClick(id) {
    if (id === "switch") switchTo(!model.enabled);
    else if (id === "reload") reload();
    else if (id.startsWith("done:")) markDone(id.slice(5));
    else if (id.startsWith("row:")) copy(id.slice(4));
  }

  function onTimer(id) {
    if (id === `poll:${model.poll}`) reload();
    else if (id === `copied:${model.copied}`) model.copied = null;
  }

  const iconButton = (id, icon, tooltip) => ui.button(id, [ui.row([icon], { padding: 5 })], { tooltip });

  function rowView(item, at) {
    const key = keyOf(item);
    const isCopied = model.copied === key;
    return ui.button(
      `row:${key}`,
      [
        ui.row(
          [
            ui.column(
              [
                ui.row([ui.text(item.reason || labelOf(item.source), { style: "dim", color: "status.done", grow: false, maxLines: 1 }), ui.text(item.context, { style: "dim", maxLines: 1 })], { gap: 6 }),
                ui.text(item.title, { maxLines: 2 }),
              ],
              { gap: 2 },
            ),
            ui.text(isCopied ? "Copied" : ageOf(item.updatedAt, at), { style: "dim", color: isCopied ? "status.done" : undefined, width: 44, align: "end", maxLines: 1 }),
            iconButton(`done:${key}`, ui.icon("check.svg", { size: 12, color: "dim" }), "Done"),
          ],
          { gap: ROW_GAP, padding: 4 },
        ),
      ],
      { tooltip: item.url ? "Copy the link" : undefined },
    );
  }

  function view() {
    const switchButton = ui.button("switch", [ui.row([ui.text(model.enabled ? "On" : "Off", { style: "dim", grow: false })], { padding: 5 })], { tooltip: model.enabled ? "Turn off" : "Turn on", selected: model.enabled });
    if (!model.enabled) {
      return ui.column([ui.row([ui.text("Off. Nothing is loaded until it is turned on.", { style: "dim" }), switchButton], { gap: 8 })], { gap: 8 });
    }
    const items = waiting();
    const at = now();
    const status = model.loading ? "Updating…" : model.offline ? "Offline" : model.state.fetchedAt ? `Updated ${clockOf(model.state.fetchedAt)}` : "Not loaded yet";
    const header = ui.row(
      [
        ui.text(items.length > 0 ? `${items.length} waiting` : "", { style: "dim" }),
        ui.text(status, { style: "dim", grow: false }),
        model.loading ? ui.row([ui.spinner({ size: 14, color: "dim" })], { padding: 5 }) : iconButton("reload", ui.icon("reload.svg", { size: 14, color: "dim" }), "Reload"),
        switchButton,
      ],
      { gap: 8, height: 32 },
    );
    const errors = Object.entries(model.state.errors).map(([source, message]) => ui.text(`${labelOf(source)}: ${message}`, { color: "status.blocked", maxLines: 1 }));
    const body = items.length === 0
      ? [ui.text(model.state.fetchedAt ? "Nothing waiting" : "Waiting for the first update…", { style: "dim" })]
      : [ui.scroll(items.map((item) => rowView(item, at)), { gap: 1 })];
    return ui.column([header, ...errors, ui.divider(), ...body], { gap: 6 });
  }

  const redraw = () => {
    showBadge();
    tree = view();
  };

  return {
    model,
    start() {
      model.enabled = parsed(nikol.data.read(SETTINGS_FILE))?.enabled === true;
      model.state = forSources(readState(parsed(nikol.data.read(STATE_FILE))), SOURCES.map((source) => source.id));
      model.done = readDone(parsed(nikol.data.read(DONE_FILE)));
      if (model.enabled) reload();
      redraw();
    },
    event(name, payload) {
      if (name === "exec") {
        if (payload.id === "network") checked(payload);
        else if (payload.id.startsWith("load:")) loaded(payload.id.slice(5), payload);
      } else if (name === "timer") {
        onTimer(payload.id);
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

if (globalThis.nikol?.exec) globalThis.nikol.register(createInbox(globalThis.nikol));
