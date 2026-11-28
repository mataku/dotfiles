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
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;
const STANDALONE = "standalone";
const ROW_HEIGHT = 30;
const GROUP_HEIGHT = 28;

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

export function failureOf(result) {
  if (result.error === "not-found") return "docker was not found in PATH";
  if (result.error === "timeout") return "docker did not answer in time";
  if (result.error === "busy") return "too many docker commands are running";
  if (result.error) return clean(result.error) || "docker could not be run";
  if (result.code === 0) return null;
  if (DAEMON_DOWN.test(result.stderr)) return "Docker is not running";
  return clean(result.stderr.split("\n")[0]) || `docker exited with code ${result.code}`;
}

export function clockOf(time) {
  const at = new Date(time);
  return [at.getHours(), at.getMinutes(), at.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

export function createContainers(nikol) {
  const { ui } = nikol;
  const model = {
    containers: [],
    failure: null,
    loadedAt: null,
    loading: false,
    reloadWanted: false,
    cursor: null,
    busy: new Map(),
    errors: new Map(),
    poll: 0,
  };
  let tree = null;

  const rows = () => rowsOf(groupContainers(model.containers));
  const ids = () => rows().filter((row) => row.container).map((row) => row.container.id);

  function read() {
    model.reloadWanted = false;
    model.loading = true;
    nikol.exec("ps", DOCKER, ["ps", "-a", ...JSON_LINES], { timeout: READ_TIMEOUT_MS });
  }

  function finishRead() {
    model.loading = false;
    if (model.reloadWanted) return read();
    model.poll++;
    nikol.timer.after(POLL_MS, `poll:${model.poll}`);
  }

  function requestReload() {
    if (model.loading) model.reloadWanted = true;
    else read();
  }

  function listed(result) {
    model.failure = failureOf(result);
    if (model.failure !== null) {
      model.containers = [];
      return finishRead();
    }
    const previous = new Map(model.containers.map((container) => [container.id, container]));
    const containers = parseContainers(result.stdout);
    model.containers = containers.map((container) => {
      const before = previous.get(container.id);
      return container.active && before?.active ? { ...container, cpu: before.cpu, memory: before.memory } : container;
    });
    model.loadedAt = Date.now();
    for (const id of model.errors.keys()) if (!containers.some((container) => container.id === id)) model.errors.delete(id);
    if (!containers.some((container) => container.id === model.cursor)) model.cursor = ids()[0] ?? null;
    if (!containers.some((container) => container.active)) return finishRead();
    nikol.exec("stats", DOCKER, ["stats", "--no-stream", ...JSON_LINES], { timeout: READ_TIMEOUT_MS });
  }

  function measured(result) {
    if (failureOf(result) === null) model.containers = mergeStats(model.containers, parseStats(result.stdout));
    finishRead();
  }

  function perform(id) {
    const container = model.containers.find((candidate) => candidate.id === id);
    if (!container || model.busy.has(id)) return;
    const action = actionOf(container);
    model.busy.set(id, action.busy);
    model.errors.delete(id);
    nikol.exec(`act:${id}`, DOCKER, action.args, { timeout: ACTION_TIMEOUT_MS });
  }

  function acted(id, result) {
    model.busy.delete(id);
    const failure = failureOf(result);
    if (failure !== null) model.errors.set(id, failure);
    requestReload();
  }

  function onKey({ key, cmd, alt, ctrl }) {
    if (cmd || alt || ctrl) return;
    if (key === "down") model.cursor = stepCursor(ids(), model.cursor, 1);
    else if (key === "up") model.cursor = stepCursor(ids(), model.cursor, -1);
    else if (key === "enter") perform(model.cursor);
    else if (key === "r") requestReload();
  }

  function onClick(id) {
    if (id === "reload") requestReload();
    else if (id.startsWith("act:")) perform(id.slice(4));
    else if (id.startsWith("row:")) model.cursor = id.slice(4);
  }

  function rowView(container) {
    const busy = model.busy.get(container.id);
    const error = model.errors.get(container.id);
    const action = actionOf(container);
    const column = (width, text, options = {}) => ui.text(text ?? "", { width, maxLines: 1, style: "dim", ...options });
    const cells = error
      ? [ui.text(error, { width: 618, maxLines: 1, color: "status.blocked" })]
      : [
          column(150, container.image),
          column(190, busy ? `${busy}…` : container.status),
          column(52, container.cpu, { align: "end" }),
          column(64, container.memory, { align: "end" }),
          column(130, container.ports),
        ];
    const control = busy
      ? ui.row([ui.spinner({ size: 12 })], { padding: 6 })
      : ui.button(`act:${container.id}`, [ui.row([ui.icon(container.active ? "stop" : "play", { size: 11, color: "dim" })], { padding: 6 })], { tooltip: action.label });
    return ui.button(
      `row:${container.id}`,
      [
        ui.row(
          [
            ui.spacer(16),
            ui.dot(container.active ? "status.inProgress" : "status.pending", { size: 7 }),
            ui.text(container.name, { maxLines: 1, color: container.active ? "fg" : "dim" }),
            ...cells,
            control,
          ],
          { height: ROW_HEIGHT, gap: 8, padding: 2 },
        ),
      ],
      { selected: container.id === model.cursor },
    );
  }

  function groupView(group) {
    const running = group.containers.filter((container) => container.active).length;
    return ui.row(
      [
        ui.text(group.title, { style: "dim", maxLines: 1 }),
        ui.text(running > 0 ? `${running} running · ${group.containers.length}` : String(group.containers.length), { style: "dim", grow: false }),
      ],
      { height: GROUP_HEIGHT, gap: 6, padding: 2 },
    );
  }

  function view() {
    const status = model.failure !== null ? "" : model.loadedAt === null ? "Loading…" : `${summaryOf(model.containers)} · Updated ${clockOf(model.loadedAt)}`;
    const list = model.failure !== null ? [] : rows();
    const header = ui.row(
      [
        ui.text("Containers", { style: "heading", maxLines: 1 }),
        ui.text(status, { style: "dim", grow: false }),
        ui.button("reload", [ui.row([model.loading ? ui.spinner({ size: 14, color: "dim" }) : ui.icon("reload", { size: 14, color: "dim" })], { padding: 5 })], { tooltip: "Reload" }),
      ],
      { height: 36, gap: 8, padding: 6 },
    );
    const body = [];
    if (model.failure !== null) body.push(ui.text(model.failure, { color: "status.blocked", maxLines: 1 }));
    else if (list.length === 0) body.push(ui.text(model.loadedAt === null ? "Looking for containers…" : "No containers", { style: "dim" }));
    else body.push(ui.scroll(list.map((row) => (row.container ? rowView(row.container) : groupView(row.group))), { gap: 1, reveal: model.cursor === null ? undefined : `row:${model.cursor}` }));
    const hints = ui.row(["↑↓  select", "⏎  start / stop", "r  refresh", "esc  close"].map((hint) => ui.text(hint, { style: "dim", grow: false })), { height: 28, gap: 16, padding: 6 });
    return ui.column([header, ui.divider(), ui.column(body, { padding: 6 }), ui.divider(), hints], { padding: 4 });
  }

  const redraw = () => {
    tree = view();
  };

  return {
    model,
    start() {
      read();
      redraw();
    },
    event(name, payload) {
      if (name === "exec") {
        if (payload.id === "ps") listed(payload);
        else if (payload.id === "stats") measured(payload);
        else if (payload.id.startsWith("act:")) acted(payload.id.slice(4), payload);
      } else if (name === "timer") {
        if (payload.id === `poll:${model.poll}` && !model.loading) read();
      } else if (name === "key") {
        onKey(payload);
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

if (globalThis.nikol?.exec) globalThis.nikol.register(createContainers(globalThis.nikol));
