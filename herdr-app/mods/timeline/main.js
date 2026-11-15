import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, terminals, theme, run, layout, props, home, exec, readTextFile, watchFolder } from "herdr";

const EXPORT_VERSION = 1;
const EXPORT_DIR = ".local/state/agent-timeline";
const TERMINAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const STATUSES = ["pending", "in_progress", "done", "blocked"];
const NOTED = ["in_progress", "blocked"];
const MAX_DEPTH = 4;
const MAX_TASKS = 200;
const MAX_TEXT = 500;

const textOf = (value) => (typeof value === "string" ? value.slice(0, MAX_TEXT).trim() : "");
const numberOf = (value, max) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0);

function tasksOf(input, depth, budget) {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const tasks = [];
  for (const raw of input) {
    if (budget.left === 0) break;
    const title = textOf(raw?.title);
    if (title === "") continue;
    budget.left -= 1;
    const task = {
      id: textOf(raw.id) || `${depth}-${budget.left}`,
      title,
      status: STATUSES.includes(raw.status) ? raw.status : "pending",
      share: numberOf(raw.share, 1),
      children: tasksOf(raw.children, depth + 1, budget),
    };
    const note = textOf(raw.note);
    tasks.push(note === "" ? task : { ...task, note });
  }
  return tasks;
}

export function parseExport(text, terminal) {
  if (typeof text !== "string") return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (body?.version !== EXPORT_VERSION || body.terminal !== terminal || typeof body.plan !== "object" || body.plan === null) return null;
  const tasks = tasksOf(body.plan.tasks, 1, { left: MAX_TASKS });
  if (tasks.length === 0) return null;
  return {
    terminal,
    agent: textOf(body.agent),
    updatedAt: numberOf(body.updatedAt, Number.MAX_SAFE_INTEGER),
    plan: {
      title: textOf(body.plan.title) || "Untitled",
      percent: Math.floor(numberOf(body.plan.percent, 100)),
      done: Math.floor(numberOf(body.plan.done, MAX_TASKS)),
      total: Math.floor(numberOf(body.plan.total, MAX_TASKS)),
      tasks,
    },
  };
}

export const fileOf = (home, terminal) =>
  typeof terminal === "string" && TERMINAL_ID.test(terminal) ? `${home}/${EXPORT_DIR}/${terminal}.json` : null;

export const isCurrent = (entry, terminal) => typeof terminal?.created_ms !== "number" || entry.updatedAt >= terminal.created_ms;

export const folderOf = (home) => `${home}/${EXPORT_DIR}`;

export const leavesOf = (tasks) => tasks.flatMap((t) => (t.children.length === 0 ? [t] : leavesOf(t.children)));

export const rowsOf = (plan) => {
  const rows = (tasks, trail) =>
    tasks.flatMap((t, i) => {
      const isLast = i === tasks.length - 1;
      return [
        {
          id: t.id,
          depth: trail.length,
          title: t.title,
          status: t.status,
          note: NOTED.includes(t.status) && t.note ? t.note : null,
          isFirst: i === 0,
          isLast,
          hasChildren: t.children.length > 0,
          trail,
        },
        ...rows(t.children, [...trail, !isLast]),
      ];
    });
  return rows(plan.tasks, []);
};

export function visiblePlans(spaces, panes, plans) {
  const tabs = spaces.find((s) => s.active)?.tabs ?? [];
  return tabs.flatMap((tab) =>
    panes
      .filter((p) => p.tab === tab.id && p.terminal && plans[p.terminal])
      .map((p) => ({ terminal: p.terminal, tab: tab.name, program: p.program?.name ?? "", focused: Boolean(p.focused), plan: plans[p.terminal].plan })),
  );
}

const BLOCK = "timeline";
const WIDTH = 300;
const REFRESH_MS = 10000;
const DOT = 10;
const DOT_NESTED = 8;
const RAIL_GAP = 10;
const RAIL_LINE = 2;
const ROW_PAD = 5;
const ROW_CENTER = ROW_PAD + 9;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const colorOf = (t, status) => ({ pending: t.dim, in_progress: t.working, done: t.done, blocked: t.blocked })[status];

export default class Timeline extends View {
  init(_props, cx) {
    this.plans = {};
    this.picked = null;
    this.block = props()?.block ?? BLOCK;
    this.width = props()?.width ?? WIDTH;
    this.reload(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.reload(cx));
    cx.spawn(async (cx) => {
      const folder = folderOf(home());
      try {
        await exec("mkdir", ["-p", folder]);
        for (;;) {
          await watchFolder(folder);
          this.reload(cx);
        }
      } catch {}
    });
  }

  reload(cx) {
    if (this.loading) {
      this.stale = true;
      return;
    }
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const shown = [...new Set(panes().map((p) => p.terminal))].filter((t) => fileOf(home(), t));
        const plans = {};
        for (const terminal of shown) {
          const read = parseExport(await readTextFile(fileOf(home(), terminal)).catch(() => null), terminal);
          const kept = read === undefined ? this.plans[terminal] : read;
          if (kept && isCurrent(kept, terminals().find((t) => t.address === terminal))) plans[terminal] = kept;
        }
        this.plans = plans;
      } finally {
        this.loading = false;
        this.loaded = true;
        cx.notify();
        if (this.stale) {
          this.stale = false;
          this.reload(cx);
        }
      }
    });
  }

  fit(isNeeded) {
    const shown = (find(layout(), this.block)?.size?.px ?? 0) > 0;
    if (shown === isNeeded || this.fitted === isNeeded) return;
    this.fitted = isNeeded;
    run("layout.resize", { id: this.block, px: isNeeded ? this.width : 0 });
  }

  bar(t, plan, height) {
    return h_flex().w_full().gap(2).children(
      leavesOf(plan.tasks).map((leaf) =>
        div().h(height).rounded(height / 2).flex_basis(0).flex_grow(Math.max(leaf.share, 0.01) * 1000)
          .bg(leaf.status === "pending" ? t.border : colorOf(t, leaf.status))));
  }

  agentRow(t, entry, isPicked) {
    return v_flex().id(`agent-${entry.terminal}`).px(8).py(6).gap(5).rounded(6)
      .when(isPicked, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        this.picked = entry.terminal;
        run("pane.focus", { terminal: entry.terminal });
        cx.notify();
      })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().truncate().text_color(isPicked ? t.foreground : t.muted).child(`${entry.tab} · ${entry.program}`))
        .child(div().text_color(t.dim).child(`${entry.plan.percent}%`)))
      .child(this.bar(t, entry.plan, 3));
  }

  dot(t, row) {
    const size = row.depth === 0 ? DOT : DOT_NESTED;
    const dot = div().size(size).rounded(size / 2);
    if (row.status === "pending") return dot.border(1.5).border_color(t.dim);
    return dot.bg(colorOf(t, row.status));
  }

  taskRow(t, row) {
    const tone = row.status === "done" ? t.dim : row.status === "pending" ? t.muted : t.foreground;
    const size = row.depth === 0 ? DOT : DOT_NESTED;
    const line = () => div().bg(t.dim).opacity(0.6);
    const upright = () => line().w(RAIL_LINE);
    const column = () => v_flex().w(DOT).flex_none().items_center();
    const reach = (DOT - RAIL_LINE) / 2;
    const ancestors = row.trail.flatMap((isContinued, level) => {
      const isElbow = row.isFirst && level === row.depth - 1;
      const through = upright().flex_1().when(!isContinued, (el) => el.invisible());
      const lane = isElbow ? column().child(upright().h(ROW_CENTER)).child(through) : column().child(through);
      const branch = v_flex().w(RAIL_GAP).flex_none()
        .when(isElbow, (el) => el.child(line().mt(ROW_CENTER - RAIL_LINE / 2).ml(-reach).mr(-(DOT - size) / 2).h(RAIL_LINE)));
      return [lane, branch];
    });
    const rail = column()
      .child(upright().h(ROW_CENTER - size / 2).when(row.isFirst, (el) => el.invisible()))
      .child(this.dot(t, row))
      .child(upright().flex_1().when(row.isLast && !row.hasChildren, (el) => el.invisible()));
    return h_flex().items_stretch()
      .children(ancestors)
      .child(rail)
      .child(v_flex().flex_1().min_w(0).ml(RAIL_GAP).py(ROW_PAD).gap(1)
        .child(div().text_color(tone).when(row.status === "in_progress", (el) => el.font_semibold()).child(row.title))
        .when(Boolean(row.note), (el) => el.child(div().text_size(11.5).text_color(row.status === "blocked" ? t.blocked : t.muted).child(row.note))));
  }

  render() {
    const t = theme();
    const list = visiblePlans(spaces(), panes(), this.plans);
    if (this.loaded) this.fit(list.length > 0);
    if (list.length === 0) return div();
    const shown = list.find((e) => e.focused) ?? list.find((e) => e.terminal === this.picked) ?? list[0];
    const { plan } = shown;
    return v_flex().id("timeline-root").size_full().bg(t.chrome).text_size(12.5).text_color(t.foreground)
      .child(div().px(16).pt(16).pb(8).text_size(11.5).text_color(t.muted).child("Timeline"))
      .when(list.length > 1, (el) => el.child(v_flex().px(8).pb(8).gap(2).border_b(1).border_color(t.border)
        .children(list.map((entry) => this.agentRow(t, entry, entry === shown)))))
      .child(v_flex().px(16).pt(10).pb(12).gap(8)
        .child(div().text_size(14).font_semibold().child(plan.title))
        .child(this.bar(t, plan, 6))
        .child(h_flex().gap(6).text_color(t.muted)
          .child(div().text_color(t.foreground).child(`${plan.percent}%`))
          .child(`${plan.done}/${plan.total} tasks`)))
      .child(v_flex().id("timeline-tasks").flex_1().min_h(0).px(16).pb(16).overflow_y_scrollbar()
        .children(rowsOf(plan).map((row) => this.taskRow(t, row))));
  }
}
