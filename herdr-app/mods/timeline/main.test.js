import assert from "node:assert/strict";
import { test } from "node:test";

import { register } from "node:module";

const HOST_MODULES = {
  "gpui-kit": ["View", "div"],
  "gpui-base": ["v_flex", "h_flex"],
  herdr: ["spaces", "panes", "terminals", "theme", "run", "layout", "props", "home", "exec", "readTextFile", "watchFolder"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((n) => `export const ${n} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const { fileOf, isCurrent, leavesOf, parseExport, rowsOf, visiblePlans } = await import("./main.js");

const plan = {
  title: "Ship timeline",
  percent: 50,
  done: 1,
  total: 3,
  tasks: [
    { id: "1", title: "Research", status: "done", share: 0.5, children: [] },
    {
      id: "2", title: "Build", status: "in_progress", share: 0.5, note: "half way",
      children: [
        { id: "2.1", title: "Tree", status: "in_progress", share: 0.25, children: [] },
        { id: "2.2", title: "Bar", status: "blocked", share: 0.25, note: "needs a token", children: [] },
      ],
    },
  ],
};

const file = (over = {}) => JSON.stringify({ version: 1, terminal: "t7", agent: "claude", updatedAt: 5, plan, ...over });

test("reads an exported plan", () => {
  assert.deepEqual(parseExport(file(), "t7"), { terminal: "t7", agent: "claude", updatedAt: 5, plan });
});

test("reads nothing from a file without a plan, of another version, for another terminal, or cut short", () => {
  assert.equal(parseExport(file({ plan: null }), "t7"), null);
  assert.equal(parseExport(file({ version: 2 }), "t7"), null);
  assert.equal(parseExport(file(), "t8"), null);
  assert.equal(parseExport(file().slice(0, 40), "t7"), undefined);
  assert.equal(parseExport(null, "t7"), null);
});

test("drops what it cannot draw and keeps the rest", () => {
  const odd = { title: 7, percent: 400, done: "x", total: 2, tasks: [{ id: "1", title: "A", status: "running", share: 9 }, "junk", { title: "" }] };
  assert.deepEqual(parseExport(file({ plan: odd }), "t7").plan, {
    title: "Untitled",
    percent: 100,
    done: 0,
    total: 2,
    tasks: [{ id: "1", title: "A", status: "pending", share: 1, children: [] }],
  });
});

test("stops at 4 levels and 200 tasks", () => {
  const nest = (depth) => ({ id: `d${depth}`, title: "t", status: "done", share: 1, children: depth < 6 ? [nest(depth + 1)] : [] });
  const deep = parseExport(file({ plan: { ...plan, tasks: [nest(1)] } }), "t7").plan;
  assert.deepEqual(rowsOf(deep).map((r) => r.depth), [0, 1, 2, 3]);
  const wide = Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, title: "t", status: "done", share: 0, children: [] }));
  assert.equal(parseExport(file({ plan: { ...plan, tasks: wide } }), "t7").plan.tasks.length, 200);
});

test("lists the tree as rows, with a note only where work is under way or stuck", () => {
  const done = { ...plan, tasks: [{ ...plan.tasks[0], note: "kept quiet" }, plan.tasks[1]] };
  assert.deepEqual(rowsOf(done), [
    { id: "1", depth: 0, title: "Research", status: "done", note: null, isFirst: true, isLast: false, hasChildren: false, trail: [] },
    { id: "2", depth: 0, title: "Build", status: "in_progress", note: "half way", isFirst: false, isLast: true, hasChildren: true, trail: [] },
    { id: "2.1", depth: 1, title: "Tree", status: "in_progress", note: null, isFirst: true, isLast: false, hasChildren: false, trail: [false] },
    { id: "2.2", depth: 1, title: "Bar", status: "blocked", note: "needs a token", isFirst: false, isLast: true, hasChildren: false, trail: [false] },
  ]);
  const more = { ...plan, tasks: [plan.tasks[1], plan.tasks[0]] };
  assert.deepEqual(rowsOf(more).map((r) => [r.id, r.trail]), [["2", []], ["2.1", [true]], ["2.2", [true]], ["1", []]]);
});

test("the bar has one piece per task without subtasks", () => {
  assert.deepEqual(leavesOf(plan.tasks).map((l) => [l.status, l.share]), [["done", 0.5], ["in_progress", 0.25], ["blocked", 0.25]]);
});

test("names the file of a terminal on this computer only", () => {
  assert.equal(fileOf("/home/me", "t7"), "/home/me/.local/state/agent-timeline/t7.json");
  assert.equal(fileOf("/home/me", "vps/t7"), null);
  assert.equal(fileOf("/home/me", "../x"), null);
  assert.equal(fileOf("/home/me", null), null);
});

test("shows the plans of the shown space only, in tab order", () => {
  const spaces = [
    { id: "s1", active: true, tabs: [{ id: "a", index: 1, name: "1" }, { id: "b", index: 2, name: "review" }] },
    { id: "s2", active: false, tabs: [{ id: "c", index: 1, name: "1" }] },
  ];
  const panes = [
    { pane: "p3", terminal: "t3", tab: "b", program: { name: "Codex" }, focused: false },
    { pane: "p1", terminal: "t1", tab: "a", program: { name: "Claude Code" }, focused: true },
    { pane: "p2", terminal: "t2", tab: "c", program: { name: "Claude Code" }, focused: false },
    { pane: "p4", terminal: null, tab: "a", mod: "files", focused: false },
    { pane: "p5", terminal: "t5", tab: "a", program: { name: "fish" }, focused: false },
  ];
  const plans = { t1: { plan }, t2: { plan }, t3: { plan } };
  assert.deepEqual(visiblePlans(spaces, panes, plans).map((v) => [v.terminal, v.tab, v.program, v.focused]), [
    ["t1", "1", "Claude Code", true],
    ["t3", "review", "Codex", false],
  ]);
  assert.deepEqual(visiblePlans([], panes, plans), []);
});

test("a file written before its terminal started belongs to an earlier one", () => {
  const entry = parseExport(file(), "t7");
  assert.equal(isCurrent(entry, { created_ms: 6 }), false);
  assert.equal(isCurrent(entry, { created_ms: 5 }), true);
  assert.equal(isCurrent(entry, undefined), true);
});
