import { View, div, svg } from "gpui-kit";
import { Input, InputState, ScrollHandle, h_flex, v_flex } from "gpui-base";
import { checking, closeOverlay, exec, focused, home, panes, props, run, spaces, theme } from "herdr";

const FIND = "/usr/bin/find";
// Why stat is named by path: a GNU stat earlier in PATH does not know -f.
const STAT = "/usr/bin/stat";
const TEST = "/bin/test";
const LOAD_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 15_000;
const GIT_TIMEOUT_MS = 5_000;
const CHECK_TIMEOUT_MS = 5_000;
const SEARCH_DELAY_MS = 300;
const MIN_PHRASE = 2;
const MAX_TITLE = 200;
const MAX_ROWS = 200;
const UNFOLD_ROWS = 12;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Why --no-config and --no-ignore: the person's ripgreprc could change the output, and an ignore file must not hide a transcript.
// Why --max-columns: one unexpectedly long record would fill the 8 MiB that exec returns.
const RG_ARGS = ["--no-config", "--no-ignore", "--color", "never", "--no-heading", "--with-filename", "--no-line-number", "--max-columns", "4000", "--max-depth", "2", "--glob", "*.jsonl"];
const FOLDER = String.raw`"cwd":"(?:[^"\\]|\\.)*"`;
const TITLE = '"type":"ai-title"';
// Why the key and not "type":"last-prompt": the first record of that type holds no prompt in most transcripts.
const PROMPT = '"lastPrompt":"';
const NAME = '"type":"(custom-title|agent-name)"';

// Why git is told to ignore fsmonitor: that setting names a program to run, and it comes from the repository being asked about.
const GIT_ROOT = ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"];
const NOT_FOUND = /no such file or directory/i;
const TIMED_OUT = /took longer than/i;
const BLANK = /[\u0000-\u001f\u007f-\u009f\s]+/g;
const NOT_ASCII = /[^\x00-\x7f]/;
const TRANSCRIPT = /^(\d+) (\d+) (.+\.jsonl)$/;

const RELOAD_ICON = "mods/simulators/icons/reload.svg";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 90;
const LIST_MAX_HEIGHT = 460;
const GROUP_HEIGHT = 28;
const ROW_HEIGHT = 30;
const LIST_GAP = 1;
const LIST_PADDING = 6;
const STATUS_WIDTH = 64;
const FOLDER_WIDTH = 220;
const AGE_WIDTH = 36;
const COLUMN_GAP = 8;
const ERROR_WIDTH = STATUS_WIDTH + FOLDER_WIDTH + AGE_WIDTH + COLUMN_GAP * 2;

const clean = (value) => (typeof value === "string" ? value.replace(BLANK, " ").trim() : "");
const messageOf = (error) => String(error?.message ?? error);
const linesOf = (printed) => printed.split("\n").filter((line) => line !== "");
const byNewest = (a, b) => b.updatedAt - a.updatedAt;

export function failureOf(error, program) {
  const message = messageOf(error);
  if (NOT_FOUND.test(message)) return `${program} was not found in PATH`;
  if (TIMED_OUT.test(message)) return `${program} did not answer in time`;
  return message;
}

export function outputOf(result, program) {
  if (result.code === 0 || result.stdout !== "") return result.stdout;
  if (NOT_FOUND.test(result.stderr)) return "";
  if (program === "rg" && result.code === 1) return "";
  throw new Error(clean(result.stderr.split("\n")[0]) || `${program} exited with code ${result.code}`);
}

async function printed(host, program, args, timeout) {
  let result;
  try {
    result = await host.exec(program, args, { timeout });
  } catch (error) {
    throw new Error(failureOf(error, program));
  }
  return outputOf(result, program);
}

export function splitMatch(line) {
  const at = line.indexOf(".jsonl:");
  if (at < 0) return null;
  const end = at + ".jsonl".length;
  return { path: line.slice(0, end), text: line.slice(end + 1) };
}

export function parseFiles(printed) {
  return linesOf(printed)
    .map((line) => line.match(TRANSCRIPT))
    .filter(Boolean)
    .map(([, seconds, , path]) => ({ path, id: path.slice(path.lastIndexOf("/") + 1, -".jsonl".length), updatedAt: Number(seconds) * 1000 }));
}

function parseRecord(text) {
  try {
    const record = JSON.parse(text);
    return record !== null && typeof record === "object" ? record : null;
  } catch {
    return null;
  }
}

function recordsOf(printed, textOf = (text) => text) {
  return linesOf(printed)
    .map(splitMatch)
    .filter(Boolean)
    .map(({ path, text }) => ({ path, record: parseRecord(textOf(text)) }))
    .filter(({ record }) => record !== null);
}

const lastRecords = (records) => new Map(records.map(({ path, record }) => [path, record]));
const firstRecords = (records) => lastRecords([...records].reverse());
const isFolder = (value) => typeof value === "string" && value.startsWith("/");

export function titleOf({ custom, generated, prompt, name }) {
  const title = [custom, generated, prompt, name].map(clean).find((text) => text !== "") ?? "";
  return [...title].slice(0, MAX_TITLE).join("");
}

const transcriptsOf = (host) => `${host.home}/.claude/projects`;

const claude = {
  id: "claude",
  label: "Claude Code",
  async load(host) {
    const root = transcriptsOf(host);
    const scan = (...args) => printed(host, "rg", [...RG_ARGS, ...args, root], LOAD_TIMEOUT_MS);
    const [files, folders, titles, prompts, names] = await Promise.all([
      printed(host, FIND, [root, "-mindepth", "2", "-maxdepth", "2", "-type", "f", "-name", "*.jsonl", "-exec", STAT, "-f", "%m %z %N", "{}", "+"], LOAD_TIMEOUT_MS),
      scan("--only-matching", "--max-count", "1", "--regexp", FOLDER),
      scan("--max-count", "1", "--regexp", TITLE),
      scan("--max-count", "1", "--regexp", PROMPT),
      scan("--regexp", NAME),
    ]);
    return { files, folders, titles, prompts, names };
  },
  parse(raw) {
    const folders = firstRecords(recordsOf(raw.folders, (text) => `{${text}}`));
    const titles = firstRecords(recordsOf(raw.titles));
    const prompts = firstRecords(recordsOf(raw.prompts));
    const names = recordsOf(raw.names);
    const customs = lastRecords(names.filter(({ record }) => record.type === "custom-title"));
    const agents = firstRecords(names.filter(({ record }) => record.type === "agent-name"));
    return parseFiles(raw.files)
      .map(({ path, id, updatedAt }) => {
        const prompt = clean(prompts.get(path)?.lastPrompt);
        const title = titleOf({ custom: customs.get(path)?.customTitle, generated: titles.get(path)?.aiTitle, prompt, name: agents.get(path)?.agentName });
        // Why the path and not the session id: one id can have a transcript in two folders, and two rows under one key would share the cursor.
        return { key: `${claude.id}:${path}`, source: claude.id, id, path, folder: folders.get(path)?.cwd, title, prompt, updatedAt };
      })
      .filter((session) => isFolder(session.folder) && session.title !== "")
      .sort(byNewest);
  },
  async search(host, phrase) {
    const args = ["--no-config", "--no-ignore", "--files-with-matches", "--ignore-case", "--fixed-strings", "--max-depth", "2", "--glob", "*.jsonl", "--regexp", phrase, transcriptsOf(host)];
    return linesOf(await printed(host, "rg", args, SEARCH_TIMEOUT_MS));
  },
  resume: (session) => ["claude", "--resume", session.id],
};

export const SOURCES = [claude];

export function loadAll(sources, host) {
  return Promise.all(
    sources.map(async (source) => {
      try {
        return { source: source.id, sessions: source.parse(await source.load(host)) };
      } catch (error) {
        return { source: source.id, error: messageOf(error) };
      }
    }),
  );
}

export function loadedOf(results, sources) {
  return {
    sessions: results.flatMap((result) => result.sessions ?? []).sort(byNewest),
    failures: results
      .filter((result) => result.error !== undefined)
      .map((result) => ({ label: sources.find((source) => source.id === result.source).label, message: result.error })),
  };
}

export async function searchAll(sources, host, phrase) {
  const answers = await Promise.all(
    sources.map(async (source) => {
      try {
        return { paths: await source.search(host, phrase), error: null };
      } catch (error) {
        return { paths: [], error: messageOf(error) };
      }
    }),
  );
  return { paths: new Set(answers.flatMap((answer) => answer.paths)), error: answers.find((answer) => answer.error !== null)?.error ?? null };
}

export function filterSessions(sessions, typed) {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return sessions.filter((session) => {
    const text = `${session.title} ${session.folder} ${session.prompt}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// Why two ASCII characters are not enough: they match nearly every transcript, while two characters of Japanese are a whole word.
export function phraseOf(typed) {
  const trimmed = typed.trim();
  const { length } = [...trimmed];
  if (length < MIN_PHRASE || (length === MIN_PHRASE && !NOT_ASCII.test(trimmed))) return null;
  return JSON.stringify(trimmed).slice(1, -1);
}

export function rankSessions(sessions, typed, found) {
  const matches = filterSessions(sessions, typed);
  if (found === null) return matches;
  const matched = new Set(matches);
  const inText = sessions.filter((session) => !matched.has(session) && found.has(session.path));
  return [...matches, ...inText.map((session) => ({ ...session, inText: true }))];
}

export async function rootOf(host, folder) {
  try {
    const result = await host.exec("git", GIT_ROOT, { cwd: folder, timeout: GIT_TIMEOUT_MS });
    const root = result.stdout.trim();
    return result.code === 0 && root !== "" ? root : folder;
  } catch {
    return folder;
  }
}

export async function hereOf(host, where, homeFolder) {
  if (where === null) return null;
  const root = await rootOf(host, where);
  return root === homeFolder ? null : root;
}

export const isInside = (folder, root) => folder === root || folder.startsWith(`${root}/`);

export const labelOf = (path, homeFolder) => (isInside(path, homeFolder) ? `~${path.slice(homeFolder.length)}` : path);

export function groupSessions(sessions, here, homeFolder, wide) {
  if (sessions.length === 0) return [];
  if (here === null) return [{ key: "all", title: "All sessions", sessions, folds: false, open: true }];
  const inside = sessions.filter((session) => isInside(session.folder, here));
  const outside = sessions.filter((session) => !isInside(session.folder, here));
  const group = { key: "here", title: labelOf(here, homeFolder), sessions: inside, folds: false, open: true };
  return outside.length === 0 ? [group] : [group, { key: "other", title: "Other folders", sessions: outside, folds: true, open: wide }];
}

const othersOf = (groups) => groups.find((group) => group.key === "other") ?? null;

export function rowsOf(groups, max) {
  let left = max;
  return groups.flatMap((group) => {
    const listed = group.open ? group.sessions.slice(0, left) : [];
    left -= listed.length;
    return [{ group }, ...listed.map((session) => ({ session }))];
  });
}

const keysOf = (rows) => rows.filter((row) => row.session).map((row) => row.session.key);

export const shownOf = (rows) => keysOf(rows).length;

export function othersHintOf(groups) {
  const others = othersOf(groups);
  if (others === null) return null;
  return others.open ? "⌃O  hide other folders" : `⌃O  ${others.sessions.length} in other folders`;
}

// Why the height is worked out here: a popup is as tall as what it holds, and a scrolling list with no height of its own would push the key hints below the popup's edge.
export function listHeightOf(rows, max) {
  if (rows.length === 0) return 0;
  const content = rows.reduce((sum, row) => sum + (row.group ? GROUP_HEIGHT : ROW_HEIGHT), 0);
  return Math.min(max, content + (rows.length - 1) * LIST_GAP + LIST_PADDING * 2);
}

export function stepCursor(ids, cursor, step) {
  if (ids.length === 0) return null;
  const at = ids.indexOf(cursor);
  return ids[at < 0 ? (step > 0 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length];
}

export const cursorOf = (keys, cursor) => (keys.includes(cursor) ? cursor : (keys[0] ?? null));

export function revealOf(rows, cursor) {
  if (rows.length === 0) return null;
  const at = rows.findIndex((row) => row.session?.key === cursor);
  const first = rows.findIndex((row) => row.session);
  return at < 0 || at === first ? 0 : at;
}

// Why unfolding moves the view and the cursor: the heading stands below the visible part of a long list, and the next key would otherwise pull the list back to a cursor left at the top.
export function afterToggle(rows, wide, cursor) {
  const kept = cursorOf(keysOf(rows), cursor);
  if (!wide) return { cursor: kept, reveal: revealOf(rows, kept) };
  const at = rows.findIndex((row) => row.group?.key === "other");
  if (at < 0) return { cursor: kept, reveal: null };
  return { cursor: rows[at + 1]?.session?.key ?? kept, reveal: Math.min(rows.length - 1, at + UNFOLD_ROWS) };
}

export function statusOf({ failed, listed, searching, shown, total }) {
  if (failed) return "";
  if (!listed) return "Loading…";
  if (searching) return "Searching transcripts…";
  return shown === total ? `${total} sessions` : `${shown} of ${total}`;
}

// Why a failed load has no text: it does not know whether the machine has sessions, so it must not say that there are none.
export function emptyTextOf({ listed, failures, total, searching, labels }) {
  if (!listed) return "Looking for sessions…";
  if (total === 0) return failures > 0 ? null : `No ${labels.join(" or ")} sessions on this machine`;
  return searching ? "Searching transcripts…" : "No session matches";
}

export function ageOf(at, now) {
  const age = now - at;
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  return `${Math.floor(age / DAY)}d`;
}

export const isRecent = (updatedAt, now) => now - updatedAt < DAY;

export function placesOf(allSpaces, allPanes) {
  return allSpaces
    .filter((space) => space.machine === null)
    .map((space) => {
      const tabs = new Set(space.tabs.map((tab) => tab.id));
      return { id: space.id, folder: allPanes.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder, active: space.active };
    })
    .filter((place) => Boolean(place.folder));
}

export function spaceFor(root, rooted) {
  const same = rooted.filter((place) => place.root === root);
  return (same.find((place) => place.active) ?? same[0])?.id ?? null;
}

// Why machine is given: without it Herdr puts the new space on the shown space's machine, and the transcript is on this one.
export function commandOf(session, argv, space) {
  if (space !== null) return { name: "tab.new", args: { space, folder: session.folder, argv } };
  return { name: "space.new", args: { folder: session.folder, argv, machine: "" } };
}

const sourceOf = (id) => SOURCES.find((source) => source.id === id);

export default class SessionHistory extends View {
  init(_props, cx) {
    // Why the folder is read first: opening the popup can move the focus, and the list must come from the terminal the person was in.
    const space = spaces().find((entry) => entry.active);
    const where = space?.machine ? null : focused()?.cwd || space?.folder || null;
    this.host = { exec, home: home() };
    this.sessions = [];
    this.failures = [];
    this.here = null;
    this.wide = false;
    this.listed = false;
    this.loading = false;
    this.found = null;
    this.searching = false;
    this.searchFailure = null;
    this.searches = 0;
    this.loads = 0;
    this.cursor = null;
    this.errors = new Map();
    this.opening = null;
    this.closed = false;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search sessions…" });
    this.input.on("change", (_event, cx) => this.search(cx));
    this.input.on("submit", (_event, cx) => this.resume(this.rows().find((row) => row.session?.key === this.cursor)?.session, cx));
    this.input.focus();
    if (checking()) return;
    this.hereFound = hereOf(this.host, where, home());
    this.load(cx);
  }

  async close() {
    this.closed = true;
  }

  load(cx) {
    const turn = ++this.loads;
    this.loading = true;
    cx.spawn(async (cx) => {
      const [results, here] = await Promise.all([loadAll(SOURCES, this.host), this.hereFound]);
      // Why the counter is checked: a reload can start before an earlier load ends, and the older result must not replace the newer one.
      if (this.closed || turn !== this.loads) return;
      const { sessions, failures } = loadedOf(results, SOURCES);
      this.sessions = sessions;
      this.failures = failures;
      this.here = here;
      this.listed = true;
      this.loading = false;
      this.moveToFirst();
      cx.notify();
    });
  }

  search(cx) {
    const turn = ++this.searches;
    const phrase = phraseOf(this.input.value());
    this.found = null;
    this.searchFailure = null;
    this.searching = phrase !== null;
    this.moveToFirst();
    cx.notify();
    if (phrase === null) return;
    cx.spawn(async (cx) => {
      await cx.sleep(SEARCH_DELAY_MS);
      // Why the counter is checked before and after the search: the text can change during either wait, and a result for an older text must not be shown under the new one.
      if (this.closed || turn !== this.searches) return;
      const { paths, error } = await searchAll(SOURCES, this.host, phrase);
      if (this.closed || turn !== this.searches) return;
      this.found = paths;
      this.searchFailure = error;
      this.searching = false;
      const rows = this.rows();
      this.moveTo(rows, cursorOf(keysOf(rows), this.cursor));
      cx.notify();
    });
  }

  groups() {
    return groupSessions(rankSessions(this.sessions, this.input.value(), this.found), this.here, home(), this.wide);
  }

  rows() {
    return rowsOf(this.groups(), MAX_ROWS);
  }

  // Why the list follows every move: Herdr keeps a list's scroll position when its rows change, so enter could otherwise resume a session that is not on screen.
  moveTo(rows, cursor) {
    this.cursor = cursor;
    this.reveal(revealOf(rows, cursor));
  }

  moveToFirst() {
    const rows = this.rows();
    this.moveTo(rows, keysOf(rows)[0] ?? null);
  }

  reveal(at) {
    if (at !== null) this.scroll.scroll_to_item(at);
  }

  step(by, cx) {
    const rows = this.rows();
    this.moveTo(rows, stepCursor(keysOf(rows), this.cursor, by));
    cx.notify();
  }

  toggleOthers(cx) {
    if (othersOf(this.groups()) === null) return;
    this.wide = !this.wide;
    const { cursor, reveal } = afterToggle(this.rows(), this.wide, this.cursor);
    this.cursor = cursor;
    this.reveal(reveal);
    cx.notify();
  }

  // Why the work runs in a spawned task: a handler's cx stops being valid when the handler returns, and git can take seconds.
  resume(session, cx) {
    if (!session || this.opening !== null) return;
    this.opening = session.key;
    this.errors.delete(session.key);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const failure = await this.folderFailure(session.folder);
        if (this.closed) return;
        if (failure !== null) {
          this.errors.set(session.key, failure);
          return;
        }
        const [root, ...rooted] = await Promise.all([
          rootOf(this.host, session.folder),
          ...placesOf(spaces(), panes()).map(async ({ id, folder, active }) => ({ id, root: await rootOf(this.host, folder), active })),
        ]);
        // Why this is checked again: the person dismissed the popup during the wait, so nothing may open any more.
        if (this.closed) return;
        const command = commandOf(session, sourceOf(session.source).resume(session), spaceFor(root, rooted));
        this.dismiss();
        run(command.name, command.args);
      } finally {
        this.opening = null;
        if (!this.closed) cx.notify();
      }
    });
  }

  async folderFailure(folder) {
    try {
      const result = await this.host.exec(TEST, ["-d", folder], { timeout: CHECK_TIMEOUT_MS });
      return result.code === 0 ? null : "Its folder is gone";
    } catch (error) {
      return failureOf(error, "test");
    }
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  renderGroup(group, t) {
    return h_flex().id(`session-history-group-${group.key}`).h(GROUP_HEIGHT).px(8).gap(6).flex_none().items_center().rounded(6)
      .text_size(11.5).text_color(t.dim)
      .when(group.folds, (heading) => heading
        .hover((style) => style.bg(t.hover))
        .on_click((_event, cx) => this.toggleOthers(cx))
        .child(div().w(10).flex_none().child(group.open ? "▾" : "▸")))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(group.title))
      .child(div().flex_none().child(String(group.sessions.length)));
  }

  renderRow(session, t, now) {
    const isOpening = this.opening === session.key;
    const error = this.errors.get(session.key);
    const column = (width, color, text) => div().w(width).flex_none().truncate().text_size(11.5).text_color(color).child(text);
    const slot = div().size(24).flex_none().flex().items_center().justify_center();
    return h_flex().id(`session-history-row-${session.key}`).h(ROW_HEIGHT).pl(24).pr(8).gap(COLUMN_GAP).flex_none().items_center().rounded(6)
      .bg(session.key === this.cursor ? t.selected : t.popover).hover((style) => style.bg(t.hover))
      .on_click((_event, cx) => this.resume(session, cx))
      .child(div().size(7).flex_none().rounded(3.5).bg(t.border))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(isRecent(session.updatedAt, now) ? t.foreground : t.muted).child(session.title))
      .when(Boolean(error), (row) => row.child(column(ERROR_WIDTH, t.blocked, error)))
      .when(!error, (row) => row
        .child(column(STATUS_WIDTH, t.dim, isOpening ? "Opening…" : session.inText ? "in text" : ""))
        .child(column(FOLDER_WIDTH, t.muted, labelOf(session.folder, home())))
        .child(column(AGE_WIDTH, t.dim, ageOf(session.updatedAt, now)).text_right()))
      .child(isOpening ? slot.text_size(12).text_color(t.dim).frames(SPINNER, SPINNER_MS) : slot);
  }

  renderError(text, t) {
    return div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked).truncate().child(text);
  }

  render() {
    const t = theme();
    const now = Date.now();
    const groups = this.groups();
    const rows = rowsOf(groups, MAX_ROWS);
    const status = statusOf({ failed: this.failures.length === SOURCES.length, listed: this.listed, searching: this.searching, shown: shownOf(rows), total: this.sessions.length });
    const emptyText = rows.length > 0 ? null : emptyTextOf({ listed: this.listed, failures: this.failures.length, total: this.sessions.length, searching: this.searching, labels: SOURCES.map((source) => source.label) });
    const othersHint = othersHintOf(groups);
    return v_flex().id("session-history-root").track_focus(this.handle).w_full().min_h(0).bg(t.popover).text_color(t.foreground)
      // Why ctrl-o and not tab: tab is bound to the window's next control, which takes the key before it arrives here and moves the keyboard out of the field.
      .on_key_down((event, cx) => {
        if (event.key === "escape") this.dismiss();
        else if (event.key === "down") this.step(1, cx);
        else if (event.key === "up") this.step(-1, cx);
        else if (event.keystroke === "ctrl-o") this.toggleOthers(cx);
        else return;
        cx.stop_propagation();
      })
      // Why a click gives the keyboard back: a press on anything that takes no focus itself moves it to this element, and the field would get no more keys.
      .on_click(() => this.input.focus())
      .child(h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12.5).font_semibold().text_color(t.foreground).child("Session history"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(status))
        .child(div().id("session-history-reload").size(24).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(t.muted).hover((style) => style.bg(t.hover).text_color(t.foreground))
          .tooltip("Reload")
          .on_click((_event, cx) => { this.load(cx); cx.notify(); })
          .child(this.loading ? svg(RELOAD_ICON).size(14).spin(900) : svg(RELOAD_ICON).size(14))))
      .child(div().px(14).pt(10).pb(4).flex_none()
        .child(h_flex().h(34).px(10).flex_none().items_center().rounded(8).border(1).border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))))
      .children(this.failures.map(({ label, message }) => this.renderError(`${label}: ${message}`, t)))
      .when(this.searchFailure !== null, (root) => root.child(this.renderError(this.searchFailure, t)))
      .when(emptyText !== null, (root) => root.child(div().px(14).py(10).flex_none().text_size(12).text_color(t.dim).child(emptyText)))
      .when(rows.length > 0, (root) => root.child(v_flex().id("session-history-scroll").h(listHeightOf(rows, LIST_MAX_HEIGHT)).flex_none().p(LIST_PADDING).gap(LIST_GAP).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map((row) => (row.session ? this.renderRow(row.session, t, now) : this.renderGroup(row.group, t))))))
      .child(h_flex().h(28).px(14).gap(16).flex_none().items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child("↑↓  select").child("⏎  resume")
        .when(othersHint !== null, (footer) => footer.child(othersHint))
        .child("esc  close"));
  }
}
