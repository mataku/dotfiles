import { View, div, svg } from "gpui-kit";
import { ScrollHandle, h_flex, v_flex } from "gpui-base";
import { checking, closeOverlay, exec, props, theme } from "herdr";

const DOCKER = "docker";
const JSON_LINES = ["--format", "{{json .}}"];
const POLL_MS = 30_000;
const READ_TIMEOUT_MS = 15_000;
const ACTION_TIMEOUT_MS = 60_000;
const ACTIVE_STATES = new Set(["running", "paused", "restarting"]);
const PROJECT_LABEL = /(?:^|,)com\.docker\.compose\.project=([^,]*)/;
const PUBLISHED_PORT = /^(?:.*:)?([\d-]+)->([\d-]+)\/(\w+)$/;
const EXPOSED_PORT = /^([\d-]+)\/(\w+)$/;
const DAEMON_DOWN = /daemon running|failed to connect to the docker API|cannot connect to the docker daemon/i;
const TIMED_OUT = /took longer than/i;
const NOT_FOUND = /no such file or directory/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;
const STANDALONE = "standalone";

const ICONS = { reload: "mods/simulators/icons/reload.svg", start: "mods/simulators/icons/play.svg", stop: "mods/simulators/icons/stop.svg" };
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 90;
const LIST_MAX_HEIGHT = 460;
const GROUP_HEIGHT = 28;
const ROW_HEIGHT = 30;
const LIST_GAP = 1;
const LIST_PADDING = 6;

const clean = (value) => (typeof value === "string" ? value.replace(CONTROL_CHARACTERS, " ").trim() : "");

function parseLines(printed) {
  const entries = [];
  for (const line of printed.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const entry = JSON.parse(line);
      if (entry !== null && typeof entry === "object") entries.push(entry);
    } catch {}
  }
  return entries;
}

export function formatPorts(printed) {
  if (typeof printed !== "string") return "";
  const shown = new Set();
  for (const part of printed.split(",").map((piece) => piece.trim()).filter(Boolean)) {
    const published = part.match(PUBLISHED_PORT);
    const exposed = part.match(EXPOSED_PORT);
    const protocol = (published ?? exposed)?.at(-1);
    const suffix = protocol && protocol !== "tcp" ? `/${protocol}` : "";
    if (published) shown.add(`${published[1]}→${published[2]}${suffix}`);
    else if (exposed) shown.add(`${exposed[1]}${suffix}`);
    else shown.add(clean(part));
  }
  return [...shown].join(", ");
}

export function parseContainers(printed) {
  return parseLines(printed)
    .filter((entry) => typeof entry.ID === "string" && entry.ID !== "")
    .map((entry) => {
      const state = clean(entry.State);
      const project = typeof entry.Labels === "string" ? entry.Labels.match(PROJECT_LABEL)?.[1] : undefined;
      return {
        id: entry.ID,
        name: clean(entry.Names),
        image: clean(entry.Image),
        state,
        active: ACTIVE_STATES.has(state),
        status: clean(entry.Status),
        ports: formatPorts(entry.Ports),
        project: project ? clean(project) : null,
      };
    });
}

export function parseStats(printed) {
  const stats = new Map();
  for (const entry of parseLines(printed)) {
    if (typeof entry.ID !== "string" || entry.ID === "") continue;
    stats.set(entry.ID, { cpu: clean(entry.CPUPerc), memory: clean(entry.MemUsage).split("/")[0].trim() });
  }
  return stats;
}

export function mergeStats(containers, stats) {
  const entries = [...stats];
  return containers.map((container) => {
    const found = entries.find(([id]) => container.id.startsWith(id) || id.startsWith(container.id));
    return found ? { ...container, ...found[1] } : container;
  });
}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function groupContainers(containers) {
  const groups = new Map();
  for (const container of containers) {
    const key = container.project === null ? STANDALONE : `project:${container.project}`;
    if (!groups.has(key)) groups.set(key, { key, title: container.project ?? STANDALONE, containers: [] });
    groups.get(key).containers.push(container);
  }
  for (const group of groups.values()) group.containers.sort((a, b) => Number(b.active) - Number(a.active) || byName(a.name, b.name));
  return [...groups.values()].sort((a, b) => Number(a.key === STANDALONE) - Number(b.key === STANDALONE) || byName(a.title, b.title));
}

export const rowsOf = (groups) => groups.flatMap((group) => [{ group }, ...group.containers.map((container) => ({ container }))]);

// Why the height is worked out here: a popup is as tall as what it holds, and a scrolling list with no height of its own pushed the key hints below the popup's edge.
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

export function summaryOf(containers) {
  if (containers.length === 0) return "No containers";
  const running = containers.filter((container) => container.active).length;
  return `${running} running · ${containers.length - running} stopped`;
}

export const actionOf = (container) =>
  container.active ? { label: "Stop", busy: "Stopping", args: ["stop", container.id] } : { label: "Start", busy: "Starting", args: ["start", container.id] };

export function failureOf({ rejected, result }) {
  if (rejected !== undefined) {
    const message = clean(String(rejected?.message ?? rejected));
    if (NOT_FOUND.test(message)) return "docker was not found in PATH";
    if (TIMED_OUT.test(message)) return "docker did not answer in time";
    return message || "docker could not be run";
  }
  if (result.code === 0) return null;
  if (DAEMON_DOWN.test(result.stderr)) return "Docker is not running";
  return clean(result.stderr.split("\n")[0]) || `docker exited with code ${result.code}`;
}

export function clockOf(time) {
  const at = new Date(time);
  return [at.getHours(), at.getMinutes(), at.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

async function docker(args, timeout) {
  try {
    return { result: await exec(DOCKER, args, { timeout }) };
  } catch (rejected) {
    return { rejected };
  }
}

const stopPress = (_event, cx) => cx.stop_propagation();

export default class Containers extends View {
  init(_props, cx) {
    this.containers = [];
    this.failure = null;
    this.loadedAt = null;
    this.loading = false;
    this.cursor = null;
    this.busy = new Map();
    this.errors = new Map();
    this.closed = false;
    this.wake = null;
    this.reloadWanted = false;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (checking()) return;
    cx.spawn((cx) => this.poll(cx));
  }

  async close() {
    this.closed = true;
    this.wake?.();
  }

  // Why one loop and not cx.timer.every: docker stats takes seconds, and a timer would start a second read while the first is still running.
  async poll(cx) {
    while (!this.closed) {
      this.reloadWanted = false;
      this.loading = true;
      cx.notify();
      await this.read(cx);
      this.loading = false;
      if (this.closed) return;
      cx.notify();
      if (!this.reloadWanted) await Promise.race([cx.sleep(POLL_MS), new Promise((resolve) => { this.wake = resolve; })]);
      this.wake = null;
    }
  }

  requestReload() {
    this.reloadWanted = true;
    this.wake?.();
  }

  async read(cx) {
    const listed = await docker(["ps", "-a", ...JSON_LINES], READ_TIMEOUT_MS);
    if (this.closed) return;
    this.failure = failureOf(listed);
    if (this.failure !== null) {
      this.containers = [];
      return;
    }
    const previous = new Map(this.containers.map((container) => [container.id, container]));
    const containers = parseContainers(listed.result.stdout);
    this.containers = containers.map((container) => {
      const before = previous.get(container.id);
      return container.active && before?.active ? { ...container, cpu: before.cpu, memory: before.memory } : container;
    });
    this.loadedAt = Date.now();
    for (const id of this.errors.keys()) if (!containers.some((container) => container.id === id)) this.errors.delete(id);
    if (!containers.some((container) => container.id === this.cursor)) this.cursor = this.ids()[0] ?? null;
    cx.notify();
    if (!containers.some((container) => container.active)) return;
    const measured = await docker(["stats", "--no-stream", ...JSON_LINES], READ_TIMEOUT_MS);
    if (this.closed || failureOf(measured) !== null) return;
    this.containers = mergeStats(containers, parseStats(measured.result.stdout));
  }

  rows() {
    return rowsOf(groupContainers(this.containers));
  }

  ids() {
    return this.rows().filter((row) => row.container).map((row) => row.container.id);
  }

  move(step, cx) {
    this.cursor = stepCursor(this.ids(), this.cursor, step);
    const at = this.rows().findIndex((row) => row.container?.id === this.cursor);
    if (at >= 0) this.scroll.scroll_to_item(at);
    cx.notify();
  }

  // Why the work runs in a spawned task: a handler's cx stops being valid when the handler returns, and stopping a container can take ten seconds.
  perform(container, cx) {
    if (!container || this.busy.has(container.id)) return;
    const action = actionOf(container);
    this.busy.set(container.id, action.busy);
    this.errors.delete(container.id);
    cx.notify();
    cx.spawn(async (cx) => {
      const failure = failureOf(await docker(action.args, ACTION_TIMEOUT_MS));
      this.busy.delete(container.id);
      if (this.closed) return;
      if (failure !== null) this.errors.set(container.id, failure);
      this.requestReload();
      cx.notify();
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  renderRow(container, t) {
    const busy = this.busy.get(container.id);
    const error = this.errors.get(container.id);
    const action = actionOf(container);
    const column = (width, text) => div().w(width).flex_none().truncate().text_size(11.5).text_color(t.muted).child(text ?? "");
    return h_flex().id(`containers-row-${container.id}`).h(ROW_HEIGHT).pl(24).pr(8).gap(8).flex_none().items_center().rounded(6)
      .bg(container.id === this.cursor ? t.selected : t.popover).hover((style) => style.bg(t.hover))
      .on_click((_event, cx) => { this.cursor = container.id; cx.notify(); })
      .child(div().size(7).flex_none().rounded(3.5).bg(container.active ? t.working : t.border))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(container.active ? t.foreground : t.muted).child(container.name))
      .when(Boolean(error), (row) => row.child(div().w(618).flex_none().truncate().text_size(11.5).text_color(t.blocked).child(error)))
      .when(!error, (row) => row
        .child(column(150, container.image))
        .child(column(190, busy ? `${busy}…` : container.status))
        .child(column(52, container.cpu).text_right())
        .child(column(64, container.memory).text_right())
        .child(column(130, container.ports)))
      .when(Boolean(busy), (row) => row.child(div().size(24).flex_none().flex().items_center().justify_center().text_size(12).text_color(t.dim).frames(SPINNER, SPINNER_MS)))
      .when(!busy, (row) => row.child(div().id(`containers-act-${container.id}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
        .border(1).border_color(t.border).text_color(t.muted)
        .hover((style) => style.bg(t.hover).text_color(t.foreground))
        .tooltip(action.label)
        .on_mouse_down("left", stopPress)
        .on_click((_event, cx) => { cx.stop_propagation(); this.perform(container, cx); })
        .child(svg(container.active ? ICONS.stop : ICONS.start).size(11))));
  }

  renderGroup(group, t) {
    const running = group.containers.filter((container) => container.active).length;
    return h_flex().id(`containers-group-${group.key}`).h(GROUP_HEIGHT).px(8).gap(6).flex_none().items_center().rounded(6)
      .text_size(11.5).text_color(t.dim)
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(group.title))
      .child(div().flex_none().child(running > 0 ? `${running} running · ${group.containers.length}` : String(group.containers.length)));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const status = this.failure !== null ? "" : this.loadedAt === null ? "Loading…" : `${summaryOf(this.containers)} · Updated ${clockOf(this.loadedAt)}`;
    const list = this.failure !== null ? [] : rows;
    return v_flex().id("containers-root").track_focus(this.handle).w_full().min_h(0).bg(t.popover).text_color(t.foreground)
      .on_key_down((event, cx) => {
        if (event.key === "escape") this.dismiss();
        else if (event.key === "down") this.move(1, cx);
        else if (event.key === "up") this.move(-1, cx);
        else if (event.key === "enter") this.perform(this.containers.find((container) => container.id === this.cursor), cx);
        else if (event.key === "r") this.requestReload();
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12.5).font_semibold().text_color(t.foreground).child("Containers"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(status))
        .child(div().id("containers-reload").size(24).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(t.muted).hover((style) => style.bg(t.hover).text_color(t.foreground))
          .tooltip("Reload")
          .on_click(() => this.requestReload())
          .child(this.loading ? svg(ICONS.reload).size(14).spin(900) : svg(ICONS.reload).size(14))))
      .when(this.failure !== null, (root) => root.child(div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked).truncate().child(this.failure)))
      .when(this.failure === null && list.length === 0, (root) => root.child(div().px(14).py(10).flex_none().text_size(12).text_color(t.dim).child(this.loadedAt === null ? "Looking for containers…" : "No containers")))
      .when(list.length > 0, (root) => root.child(v_flex().id("containers-scroll").h(listHeightOf(list, LIST_MAX_HEIGHT)).flex_none().p(LIST_PADDING).gap(LIST_GAP).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(list.map((row) => (row.container ? this.renderRow(row.container, t) : this.renderGroup(row.group, t))))))
      .child(h_flex().h(28).px(14).gap(16).flex_none().items_center().border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child("↑↓  select").child("⏎  start / stop").child("r  refresh").child("esc  close"));
  }
}
