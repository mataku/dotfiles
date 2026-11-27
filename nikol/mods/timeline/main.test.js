import assert from "node:assert/strict";
import { test } from "node:test";

const registered = [];
globalThis.nikol = { register: (mod) => registered.push(mod), ui: {} };
const { leavesOf, parsePlan, planOf, rowsOf, sessionsToShow } = await import("./main.js");

const plan = {
  title: "Ship",
  percent: 50,
  done: 1,
  total: 3,
  tasks: [
    { id: "1", title: "Research", status: "done", share: 0.5, children: [] },
    {
      id: "2", title: "Build", status: "in_progress", share: 0.5, note: "half way",
      children: [
        { id: "2.1", title: "Tree", status: "in_progress", share: 0.25, children: [] },
        { id: "2.2", title: "Bar", status: "weird", share: 0.25, children: [] },
      ],
    },
  ],
};
const file = (over = {}) => JSON.stringify({ version: 1, agent: "claude", plan, ...over });

test("registers itself on load", () => {
  assert.equal(registered.length, 1);
});

test("reads a plan and makes unknown statuses pending", () => {
  const parsed = parsePlan(file());
  assert.equal(parsed.title, "Ship");
  assert.equal(parsed.tasks[1].children[1].status, "pending");
});

test("reads nothing from another version, a broken file or an empty plan", () => {
  assert.equal(parsePlan(file({ version: 2 })), null);
  assert.equal(parsePlan(file().slice(0, 20)), null);
  assert.equal(parsePlan(file({ plan: { tasks: [] } })), null);
});

test("shows the shown tab's session first, then the other tabs of the shown workspace", () => {
  const state = {
    workspaces: [
      { active: false, tabs: [{ active: true, session: "other" }] },
      { active: true, tabs: [{ active: false, session: "s1" }, { active: false, session: null }, { active: true, session: "s3" }] },
    ],
  };
  assert.deepEqual(sessionsToShow(state), ["s3", "s1"]);
  assert.deepEqual(sessionsToShow({ workspaces: [] }), []);
});

test("reads the plan of the first session that has one", () => {
  const files = { "~/.local/state/agent-timeline/s3.json": "{}", "~/.local/state/agent-timeline/s1.json": file() };
  assert.equal(planOf(["s3", "s1"], (path) => files[path] ?? null).plan.title, "Ship");
  assert.equal(planOf(["s3"], (path) => files[path] ?? null), null);
});

test("lists leaves in order and rows depth first", () => {
  const parsed = parsePlan(file());
  assert.deepEqual(leavesOf(parsed.tasks).map((t) => t.title), ["Research", "Tree", "Bar"]);
  assert.deepEqual(
    rowsOf(parsed.tasks).map((r) => [r.task.title, r.depth, r.rails, r.branch]),
    [["Research", 0, [true], false], ["Build", 0, [false], false], ["Tree", 1, [false, true], true], ["Bar", 1, [false, false], false]],
  );
});
