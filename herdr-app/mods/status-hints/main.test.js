import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["h_flex"],
  herdr: ["spaces", "agents", "theme", "run", "window", "keys", "focused", "nextCommand", "notify"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const { keyLabel, pickAttention } = await import("./main.js");

const agent = (address, status) => ({ address, status });

test("picks a blocked agent before one that is done", () => {
  const list = [agent("t1", "working"), agent("t2", "done"), agent("t3", "blocked"), agent("t4", "blocked")];
  assert.deepEqual(pickAttention(list, null), agent("t3", "blocked"));
});

test("picks the first done agent when none is blocked", () => {
  assert.deepEqual(pickAttention([agent("t1", "idle"), agent("t2", "done"), agent("t3", "done")], null), agent("t2", "done"));
});

test("skips the agent that already has the focus", () => {
  const list = [agent("t3", "blocked"), agent("t2", "done")];
  assert.deepEqual(pickAttention(list, "t3"), agent("t2", "done"));
  assert.equal(pickAttention([agent("t3", "blocked")], "t3"), null);
});

test("picks nothing when no agent is blocked or done", () => {
  assert.equal(pickAttention([agent("t1", "working"), agent("t2", "idle")], null), null);
  assert.equal(pickAttention([], null), null);
});

test("writes a key binding with the Mac's modifier symbols", () => {
  assert.equal(keyLabel("cmd-j", true), "⌘J");
  assert.equal(keyLabel("cmd-shift-p", true), "⌘⇧P");
  assert.equal(keyLabel("ctrl-alt-left", true), "⌃⌥LEFT");
  assert.equal(keyLabel("option-x", true), "⌥X");
});

test("writes a key binding with modifier names elsewhere", () => {
  assert.equal(keyLabel("cmd-j", false), "Ctrl+J");
  assert.equal(keyLabel("ctrl-shift-alt-p", false), "Ctrl+Shift+Alt+P");
});

test("keeps the minus key when the binding ends with it", () => {
  assert.equal(keyLabel("cmd--", true), "⌘-");
  assert.equal(keyLabel("cmd-shift--", false), "Ctrl+Shift+-");
});

test("writes no label for a command without a binding", () => {
  assert.equal(keyLabel(undefined, true), null);
  assert.equal(keyLabel("", true), null);
});
