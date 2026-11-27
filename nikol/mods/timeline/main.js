const FOLDER = "~/.local/state/agent-timeline";
const STATUSES = ["pending", "in_progress", "blocked", "done"];
const COLORS = { pending: "status.pending", in_progress: "status.inProgress", blocked: "status.blocked", done: "status.done" };
const MAX_DEPTH = 4;
const CANDIDATES = 5;

const textOf = (value) => (typeof value === "string" ? value.trim().slice(0, 500) : "");

function tasksOf(input, depth) {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  return input
    .filter((raw) => raw && textOf(raw.title) !== "")
    .map((raw) => ({
      title: textOf(raw.title),
      status: STATUSES.includes(raw.status) ? raw.status : "pending",
      note: textOf(raw.note),
      share: typeof raw.share === "number" && raw.share > 0 ? raw.share : 0,
      children: tasksOf(raw.children, depth + 1),
    }));
}

export function parsePlan(text) {
  if (typeof text !== "string") return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (body?.version !== 1 || typeof body.plan !== "object" || body.plan === null) return null;
  const tasks = tasksOf(body.plan.tasks, 1);
  if (tasks.length === 0) return null;
  return {
    agent: textOf(body.agent),
    title: textOf(body.plan.title) || "Untitled",
    percent: Math.floor(Number(body.plan.percent) || 0),
    done: Math.floor(Number(body.plan.done) || 0),
    total: Math.floor(Number(body.plan.total) || 0),
    tasks,
  };
}

export function sessionsToShow(state) {
  const workspace = (state.workspaces || []).find((w) => w.active);
  if (!workspace) return [];
  const tabs = [...workspace.tabs].sort((a, b) => Number(b.active) - Number(a.active));
  return tabs.map((tab) => tab.session).filter((session) => typeof session === "string");
}

export function planOf(sessions, read) {
  for (const session of sessions) {
    const text = read(`${FOLDER}/${session}.json`);
    const plan = parsePlan(text);
    if (plan) return { plan, text };
  }
  return null;
}

export function leavesOf(tasks) {
  return tasks.flatMap((task) => (task.children.length === 0 ? [task] : leavesOf(task.children)));
}

export function rowsOf(tasks, depth = 0, rails = []) {
  return tasks.flatMap((task, i) => {
    const last = i === tasks.length - 1;
    const row = { task, depth, rails: [...rails, !last], branch: depth > 0 && i === 0, first: i === 0 };
    return [row, ...rowsOf(task.children, depth + 1, [...rails, !last])];
  });
}

function rowView({ task, depth, rails, branch, first }) {
  const noted = task.note !== "" && (task.status === "in_progress" || task.status === "blocked");
  return nikol.ui.item(task.title, {
    note: noted ? task.note : "",
    dot: COLORS[task.status],
    size: depth === 0 ? 10 : 7,
    filled: task.status !== "pending",
    rails: rails.slice(0, depth),
    branch,
    up: !first,
    down: rails[depth],
    titleColor: task.status === "done" ? "dim" : "fg",
  });
}

function planView(plan) {
  const { ui } = nikol;
  return ui.column(
    [
      ui.text(plan.title, { style: "heading", maxLines: 2 }),
      ui.progress(leavesOf(plan.tasks).map((task) => ({ color: COLORS[task.status], share: task.share }))),
      ui.text(`${plan.percent}%  ${plan.done}/${plan.total} tasks  ${plan.agent}`, { style: "dim", maxLines: 1 }),
      ui.spacer(4),
      ui.scroll(rowsOf(plan.tasks).map(rowView)),
    ],
    { gap: 8 },
  );
}

var shownSessions = "";
var lastText = null;
var lastTree = null;

function reload(state) {
  const found = planOf(sessionsToShow(state), nikol.readTextFile);
  if (found === null) {
    lastText = null;
    lastTree = null;
  } else if (found.text !== lastText) {
    lastText = found.text;
    lastTree = planView(found.plan);
  }
}

nikol.register({
  start(state) {
    nikol.watchFolder(FOLDER);
    shownSessions = sessionsToShow(state).join(",");
    reload(state);
  },
  event(name, payload, state) {
    if (name === "folder") reload(state);
  },
  render(state) {
    const sessions = sessionsToShow(state).join(",");
    if (sessions !== shownSessions) {
      shownSessions = sessions;
      reload(state);
    }
    return lastTree;
  },
});
