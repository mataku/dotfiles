import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, exec, layout, nextCommand, props, run, setBadge, setShared, shared, theme } from "herdr";

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

const github = {
  id: GITHUB,
  label: "GitHub",
  async load({ exec }) {
    const result = await exec("gh", ["api", "notifications?per_page=50"], { timeout: LOAD_TIMEOUT_MS });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `gh exited with ${result.code}`);
    return result.stdout;
  },
  parse: parseNotifications,
};

export const SOURCES = [github];

const messageOf = (error) => String(error?.message ?? error);

export function loadAll(sources, host) {
  return Promise.all(
    sources.map(async (source) => {
      try {
        return { source: source.id, items: source.parse(await source.load(host)) };
      } catch (error) {
        return { source: source.id, error: messageOf(error) };
      }
    }),
  );
}

const SCUTIL = "/usr/sbin/scutil";
const NETWORK_TIMEOUT_MS = 5000;
const REACH = /^\s*REACH : flags \S+ \((Not )?Reachable/gm;

const reachOf = (text) => [...text.matchAll(REACH)].map((match) => match[1] === undefined);

export const isReachable = (text) => reachOf(text).some(Boolean);

// Why a failed or unreadable check counts as online: only macOS has scutil, and a wrong "offline" would stop the inbox for good while a wrong "online" costs one failed load.
export async function isOnline({ exec }) {
  try {
    const result = await exec(SCUTIL, ["--nwi"], { timeout: NETWORK_TIMEOUT_MS });
    return result.code !== 0 || reachOf(result.stdout).length === 0 || isReachable(result.stdout);
  } catch {
    return true;
  }
}

export async function loadWhenOnline(sources, host) {
  return (await isOnline(host)) ? loadAll(sources, host) : null;
}

export const isEnabled = (value) => value === true;

export const enabledAfter = (command, enabled) => (command === "on" ? true : command === "off" ? false : enabled);

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u;
const DOTS = "...";
const TITLE_LINES = 2;
const TITLE_LINE_HEIGHT = 18;
const RELOAD_ICON = "mods/inbox/reload.svg";
const UNIT_WIDTH = 6.6;
const ROW_FIXED_WIDTH = 116;
const WRAP_SLACK = 0.92;
const MIN_TITLE_UNITS = 20;
const DEFAULT_PANEL_WIDTH = 360;

const unitsOf = (char) => (WIDE.test(char) ? 2 : 1);

// Why the text is cut by counting: the UI can stop text at one line but not at two, and it has no way to measure text. A wide character is taken as two narrow ones.
export function clampText(text, budget) {
  const chars = [...text];
  if (chars.reduce((sum, char) => sum + unitsOf(char), 0) <= budget) return text;
  let used = 0;
  let kept = "";
  for (const char of chars) {
    used += unitsOf(char);
    if (used > budget - DOTS.length) break;
    kept += char;
  }
  return `${kept.trimEnd()}${DOTS}`;
}

// Why the slack: lines break between words, so a line rarely fills to its last character.
export const titleBudget = (panelWidth) =>
  Math.max(MIN_TITLE_UNITS, Math.floor(((panelWidth - ROW_FIXED_WIDTH) / UNIT_WIDTH) * TITLE_LINES * WRAP_SLACK));

const PANEL = "inbox-panel";
const ENABLED_KEY = "inbox.enabled";
const ICON = "mods/inbox/inbox.svg";
const CHECK_ICON = "mods/inbox/check.svg";
const STATE_KEY = "inbox.state";
const DONE_KEY = "inbox.done";
const OFFLINE_KEY = "inbox.offline";
const POLL_MS = 5 * 60 * 1000;
const COPIED_MS = 1500;

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

const isPanelOpen = () => {
  const panel = findNode(layout(), PANEL);
  return panel !== null && !panel.hidden;
};

const enabled = () => isEnabled(shared(ENABLED_KEY));
const waiting = () => pending(readState(shared(STATE_KEY)).items, readDone(shared(DONE_KEY)));
const labelOf = (source) => SOURCES.find((entry) => entry.id === source)?.label ?? source;
const twoDigits = (value) => String(value).padStart(2, "0");
const clockOf = (at) => `${twoDigits(new Date(at).getHours())}:${twoDigits(new Date(at).getMinutes())}`;
const stopPress = (_event, cx) => cx.stop_propagation();

async function refresh() {
  const results = await loadWhenOnline(SOURCES, { exec });
  if ((results === null) !== (shared(OFFLINE_KEY) === true)) setShared(OFFLINE_KEY, results === null);
  if (results === null) return;
  const known = forSources(readState(shared(STATE_KEY)), SOURCES.map((source) => source.id));
  const state = mergeResults(known, results, Date.now());
  setShared(STATE_KEY, state);
  // Why only after every source loaded: a failed load keeps its old items, and pruning against a partial list would bring finished items back on the next success.
  if (!results.every((result) => Array.isArray(result.items))) return;
  const done = readDone(shared(DONE_KEY));
  const kept = pruneDone(done, state.items);
  if (Object.keys(kept).length !== Object.keys(done).length) setShared(DONE_KEY, kept);
}

export default class Inbox extends View {
  init(_props, cx) {
    this.role = props()?.button ? "button" : "list";
    this.loading = false;
    this.copied = null;
    this.width = DEFAULT_PANEL_WIDTH;
    // Why undefined and not null: the Dock badge outlives a reload of this mod, so the first render must set it even when nothing is waiting.
    this.badge = undefined;
    // Why the button polls: a copy starts only once it has been shown, and the panel's copy stays hidden until someone opens it.
    if (this.role !== "button" || checking()) return;
    this.reload(cx);
    cx.timer.every(POLL_MS, (cx) => this.reload(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        this.switchTo(enabledAfter(await nextCommand(), enabled()), cx);
        cx.notify();
      }
    });
  }

  switchTo(isOn, cx) {
    if (isOn === enabled()) return;
    setShared(ENABLED_KEY, isOn);
    if (isOn) this.reload(cx);
  }

  reload(cx) {
    if (this.loading || !enabled()) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        await refresh();
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  togglePanel() {
    run(isPanelOpen() ? "layout.hide" : "layout.show", { id: PANEL });
  }

  showCount(count) {
    const badge = count > 0 ? String(count) : null;
    if (checking() || badge === this.badge) return;
    this.badge = badge;
    setBadge(badge);
  }

  markDone(item) {
    setShared(DONE_KEY, { ...readDone(shared(DONE_KEY)), [keyOf(item)]: item.updatedAt });
  }

  copy(item, cx) {
    if (!item.url) return;
    const key = keyOf(item);
    cx.write_to_clipboard(item.url);
    this.copied = key;
    cx.timer.after(COPIED_MS, (cx) => {
      if (this.copied !== key) return;
      this.copied = null;
      cx.notify();
    });
    cx.notify();
  }

  renderButton(t) {
    const count = enabled() ? waiting().length : 0;
    this.showCount(count);
    const selected = isPanelOpen();
    const tone = selected || count > 0 ? t.foreground : t.muted;
    return h_flex().size_full().pr(4).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("inbox-toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(selected ? t.selected : t.chrome).text_color(tone)
        .hover((style) => style.bg(t.hover)).on_mouse_down("left", stopPress)
        .on_click(() => this.togglePanel())
        .child(svg(ICON).size(14))
        .child("Inbox")
        .when(count > 0, (el) => el.child(div().size(6).flex_none().rounded(3).bg(t.accent))));
  }

  renderRow(t, item, now) {
    const key = keyOf(item);
    const isCopied = this.copied === key;
    return h_flex().id(`inbox-row-${key}`).px(8).py(6).gap(10).items_center().rounded(6)
      .hover((style) => style.bg(t.hover))
      .on_click((_event, cx) => this.copy(item, cx))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center().text_size(11.5)
          .child(div().flex_none().text_color(t.accent).child(item.reason || labelOf(item.source)))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(item.context)))
        .child(div().max_h(TITLE_LINES * TITLE_LINE_HEIGHT).overflow_hidden().line_height(`${TITLE_LINE_HEIGHT}px`).text_color(t.foreground)
          .child(clampText(item.title, titleBudget(this.width)))))
      .child(h_flex().w(44).flex_none().justify_end().text_size(11.5).text_color(isCopied ? t.done : t.dim)
        .child(isCopied ? "Copied" : ageOf(item.updatedAt, now)))
      .child(div().id(`inbox-done-${key}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
        .border(1).border_color(t.border).text_color(t.muted)
        .hover((style) => style.bg(t.selected).text_color(t.foreground))
        .tooltip("Done")
        .on_mouse_down("left", stopPress)
        .on_click((_event, cx) => {
          cx.stop_propagation();
          this.markDone(item);
          cx.notify();
        })
        .child(svg(CHECK_ICON).size(12)));
  }

  renderSwitch(t, isOn) {
    return h_flex().id("inbox-switch").w(28).h(16).p(2).flex_none().items_center().rounded(8)
      .bg(isOn ? t.accent : t.border)
      .when(isOn, (el) => el.justify_end())
      .on_click((_event, cx) => {
        this.switchTo(!isOn, cx);
        cx.notify();
      })
      .child(div().size(12).rounded(6).bg(isOn ? t.accent_foreground : t.muted));
  }

  renderOff(t) {
    return v_flex().size_full().bg(t.chrome).text_size(12.5).text_color(t.foreground)
      .child(h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().font_semibold().child("Inbox"))
        .child(this.renderSwitch(t, false)))
      .child(div().p(14).text_color(t.dim).child("Off. Nothing is loaded until it is turned on."));
  }

  renderList(t) {
    if (!enabled()) return this.renderOff(t);
    const state = readState(shared(STATE_KEY));
    const items = pending(state.items, readDone(shared(DONE_KEY)));
    const now = Date.now();
    const errors = Object.entries(state.errors);
    const status = this.loading ? "Updating…" : shared(OFFLINE_KEY) === true ? "Offline" : state.fetchedAt ? `Updated ${clockOf(state.fetchedAt)}` : "Not loaded yet";
    const empty = div().p(10).text_color(t.dim).child(state.fetchedAt ? "Nothing waiting" : "Waiting for the first update…");
    return v_flex().id("inbox-list").size_full().bg(t.chrome).text_size(12.5).text_color(t.foreground)
      .on_size_change((size, cx) => {
        this.width = size.width;
        cx.notify();
      })
      .child(h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Inbox"))
        .child(div().flex_1().text_color(t.muted).child(items.length > 0 ? String(items.length) : ""))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(status))
        .child(div().id("inbox-reload").size(24).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.muted)
          .hover((style) => style.bg(t.hover).text_color(t.foreground))
          .tooltip("Reload")
          .on_click((_event, cx) => this.reload(cx))
          .child(this.loading ? svg(RELOAD_ICON).size(14).spin(900) : svg(RELOAD_ICON).size(14)))
        .child(this.renderSwitch(t, true)))
      .children(errors.map(([source, message]) =>
        div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked).truncate().child(`${labelOf(source)}: ${message}`)))
      .child(v_flex().id("inbox-scroll").flex_1().min_h(0).p(6).gap(1).overflow_y_scrollbar()
        .children(items.length === 0 ? [empty] : items.map((item) => this.renderRow(t, item, now))));
  }

  render() {
    const t = theme();
    return this.role === "button" ? this.renderButton(t) : this.renderList(t);
  }
}
