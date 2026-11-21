import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["h_flex", "v_flex"],
  herdr: ["checking", "exec", "layout", "props", "run", "setBadge", "setShared", "shared", "theme"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const { SOURCES, ageOf, htmlUrlOf, isOnline, isReachable, keyOf, loadAll, loadWhenOnline, mergeResults, parseNotifications, pending, pruneDone, readDone, readState, toItem } = await import("./main.js");
const github = SOURCES.find((source) => source.id === "github");

const fields = (over = {}) => ({
  id: "1",
  title: "Fix the login crash",
  context: "acme/app",
  reason: "review",
  url: "https://example.com/acme/app/pull/1",
  updatedAt: 1000,
  ...over,
});
const item = (over = {}) => toItem("github", fields(over));

test("builds an item that carries its source", () => {
  assert.deepEqual(item(), { source: "github", ...fields() });
});

test("refuses an item without an id or a title", () => {
  assert.equal(item({ id: "" }), null);
  assert.equal(item({ title: "  " }), null);
  assert.equal(item({ id: 7 }), null);
});

test("drops a url that is not http or https", () => {
  assert.equal(item({ url: "file:///etc/passwd" }).url, null);
  assert.equal(item({ url: undefined }).url, null);
});

test("fills missing optional fields with empty values", () => {
  assert.deepEqual(toItem("notes", { id: "a", title: "Read the spec" }), {
    source: "notes",
    id: "a",
    title: "Read the spec",
    context: "",
    reason: "",
    url: null,
    updatedAt: 0,
  });
});

test("keys an item by source and id", () => {
  assert.equal(keyOf(item({ id: "42" })), "github:42");
});

test("lists pending items newest first", () => {
  const list = [item({ id: "1", updatedAt: 1000 }), item({ id: "2", updatedAt: 3000 }), item({ id: "3", updatedAt: 2000 })];
  assert.deepEqual(pending(list, {}).map((i) => i.id), ["2", "3", "1"]);
});

test("hides an item marked done", () => {
  const list = [item({ id: "1" }), item({ id: "2" })];
  assert.deepEqual(pending(list, { "github:1": 1000 }).map((i) => i.id), ["2"]);
});

test("shows a done item again once it is updated", () => {
  const list = [item({ id: "1", updatedAt: 2000 })];
  assert.deepEqual(pending(list, { "github:1": 1000 }).map((i) => i.id), ["1"]);
});

test("forgets done marks whose items are gone", () => {
  const done = { "github:1": 1000, "github:9": 1000 };
  assert.deepEqual(pruneDone(done, [item({ id: "1" })]), { "github:1": 1000 });
});

test("replaces a source's items when its load succeeds", () => {
  const previous = { items: [item({ id: "1" })], errors: {}, fetchedAt: 1 };
  const next = mergeResults(previous, [{ source: "github", items: [item({ id: "2" })] }], 50);
  assert.deepEqual(next, { items: [item({ id: "2" })], errors: {}, fetchedAt: 50 });
});

test("keeps a source's last items when its load fails", () => {
  const previous = { items: [item({ id: "1" })], errors: {}, fetchedAt: 1 };
  const next = mergeResults(previous, [{ source: "github", error: "gh: not logged in" }], 50);
  assert.deepEqual(next, { items: [item({ id: "1" })], errors: { github: "gh: not logged in" }, fetchedAt: 50 });
});

test("leaves other sources' items alone", () => {
  const note = toItem("notes", { id: "a", title: "Read the spec" });
  const previous = { items: [item({ id: "1" }), note], errors: { notes: "old" }, fetchedAt: 1 };
  const next = mergeResults(previous, [{ source: "github", items: [] }], 50);
  assert.deepEqual(next, { items: [note], errors: { notes: "old" }, fetchedAt: 50 });
});

test("tells an item's age in the largest whole unit", () => {
  const now = 10 * 24 * 60 * 60 * 1000;
  const ago = (ms) => ageOf(now - ms, now);
  assert.equal(ago(20 * 1000), "now");
  assert.equal(ago(5 * 60 * 1000), "5m");
  assert.equal(ago(3 * 60 * 60 * 1000), "3h");
  assert.equal(ago(2 * 24 * 60 * 60 * 1000), "2d");
});

test("gives no age to an item without a time or from the future", () => {
  assert.equal(ageOf(0, 1000), "");
  assert.equal(ageOf(2000, 1000), "now");
});

test("reads stored done marks, dropping broken ones", () => {
  assert.deepEqual(readDone({ "github:1": 1000, "github:2": "x" }), { "github:1": 1000 });
  assert.deepEqual(readDone(null), {});
});

test("reads stored state back through the item shape", () => {
  const stored = { items: [item(), { source: "github", id: "", title: "x" }, "junk"], errors: { github: "boom", notes: 3 }, fetchedAt: 9 };
  assert.deepEqual(readState(stored), { items: [item()], errors: { github: "boom" }, fetchedAt: 9 });
});

test("reads missing or broken stored state as empty", () => {
  const empty = { items: [], errors: {}, fetchedAt: null };
  assert.deepEqual(readState(undefined), empty);
  assert.deepEqual(readState("nope"), empty);
  assert.deepEqual(readState({ items: "x", errors: null, fetchedAt: "y" }), empty);
});

const notification = (over = {}) => ({
  id: "100",
  unread: true,
  reason: "review_requested",
  updated_at: "2026-11-20T14:01:59Z",
  subject: { title: "Fix the login crash", type: "PullRequest", url: "https://api.github.com/repos/acme/app/pulls/12" },
  repository: { full_name: "acme/app", html_url: "https://github.com/acme/app" },
  ...over,
});
const subject = (type, url) => notification({ subject: { title: "t", type, url } });

test("turns a notification into an inbox item", () => {
  assert.deepEqual(parseNotifications(JSON.stringify([notification()])), [
    {
      source: "github",
      id: "100",
      title: "Fix the login crash",
      context: "acme/app",
      reason: "review",
      url: "https://github.com/acme/app/pull/12",
      updatedAt: Date.parse("2026-11-20T14:01:59Z"),
    },
  ]);
});

test("names the common reasons and passes unknown ones through", () => {
  const reasonOf = (reason) => parseNotifications(JSON.stringify([notification({ reason })]))[0].reason;
  assert.equal(reasonOf("mention"), "mention");
  assert.equal(reasonOf("team_mention"), "mention");
  assert.equal(reasonOf("assign"), "assigned");
  assert.equal(reasonOf("ci_activity"), "ci");
  assert.equal(reasonOf("author"), "your thread");
  assert.equal(reasonOf("something_new"), "something new");
});

test("skips notifications already read", () => {
  assert.deepEqual(parseNotifications(JSON.stringify([notification({ unread: false })])), []);
});

test("skips entries it cannot turn into an item", () => {
  const list = [notification({ id: "1" }), { id: "2" }, null, notification({ id: "3", subject: null })];
  assert.deepEqual(parseNotifications(JSON.stringify(list)).map((i) => i.id), ["1"]);
});

test("fails on a response that is not a list", () => {
  assert.throws(() => parseNotifications('{"message":"Bad credentials"}'));
  assert.throws(() => parseNotifications("not json"));
});

test("links a pull request, an issue and a commit to their pages", () => {
  assert.equal(htmlUrlOf(subject("PullRequest", "https://api.github.com/repos/acme/app/pulls/12")), "https://github.com/acme/app/pull/12");
  assert.equal(htmlUrlOf(subject("Issue", "https://api.github.com/repos/acme/app/issues/82")), "https://github.com/acme/app/issues/82");
  assert.equal(htmlUrlOf(subject("Commit", "https://api.github.com/repos/acme/app/commits/abc123")), "https://github.com/acme/app/commit/abc123");
});

test("links subjects without a page of their own to the closest list", () => {
  assert.equal(htmlUrlOf(subject("Release", "https://api.github.com/repos/acme/app/releases/555")), "https://github.com/acme/app/releases");
  assert.equal(htmlUrlOf(subject("Discussion", null)), "https://github.com/acme/app/discussions");
  assert.equal(htmlUrlOf(subject("CheckSuite", null)), "https://github.com/acme/app/actions");
  assert.equal(htmlUrlOf(subject("RepositoryInvitation", null)), "https://github.com/acme/app");
});

test("gives no link when the repository page is unknown", () => {
  assert.equal(htmlUrlOf(notification({ repository: { full_name: "acme/app" } })), null);
});

test("loads unread notifications through gh", async () => {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, args]);
    return { code: 0, stdout: "[]", stderr: "" };
  };
  assert.equal(await github.load({ exec }), "[]");
  assert.deepEqual(calls, [["gh", ["api", "notifications?per_page=50"]]]);
});

test("reports what gh said when the load fails", async () => {
  const exec = async () => ({ code: 1, stdout: "", stderr: "gh: To get started with GitHub CLI, please run: gh auth login\n" });
  await assert.rejects(github.load({ exec }), /gh auth login/);
});

const note = toItem("notes", { id: "a", title: "Read the spec" });
const working = { id: "notes", label: "Notes", load: async () => "raw", parse: (raw) => (raw === "raw" ? [note] : []) };

test("loads each source and parses what it returned", async () => {
  assert.deepEqual(await loadAll([working], {}), [{ source: "notes", items: [note] }]);
});

test("hands the host to a source's load", async () => {
  const host = { exec: () => {} };
  let seen = null;
  await loadAll([{ ...working, load: async (given) => { seen = given; return "raw"; } }], host);
  assert.equal(seen, host);
});

test("reports a source whose load fails without stopping the others", async () => {
  const offline = { id: "mail", label: "Mail", load: async () => { throw new Error("offline"); }, parse: () => [] };
  assert.deepEqual(await loadAll([offline, working], {}), [
    { source: "mail", error: "offline" },
    { source: "notes", items: [note] },
  ]);
});

test("reports a source whose response cannot be parsed", async () => {
  const broken = { ...working, parse: () => { throw new Error("unexpected shape"); } };
  assert.deepEqual(await loadAll([broken], {}), [{ source: "notes", error: "unexpected shape" }]);
});

test("registers sources with the parts the inbox calls", () => {
  assert.ok(SOURCES.length > 0);
  for (const source of SOURCES) {
    assert.equal(typeof source.id, "string");
    assert.equal(typeof source.label, "string");
    assert.equal(typeof source.load, "function");
    assert.equal(typeof source.parse, "function");
  }
});

const NETWORK_UP = `Network information

IPv4 network interface information
     en0 : flags      : 0x5 (IPv4,DNS)
           address    : 192.0.2.10
           reach      : 0x00000002 (Reachable)

   REACH : flags 0x00000002 (Reachable)

IPv6 network interface information
   No IPv6 states found


   REACH : flags 0x00000000 (Not Reachable)

Network interfaces: en0
`;
const NETWORK_DOWN = `Network information

IPv4 network interface information
   No IPv4 states found


   REACH : flags 0x00000000 (Not Reachable)

IPv6 network interface information
   No IPv6 states found


   REACH : flags 0x00000000 (Not Reachable)

Network interfaces:
`;
const scutil = (stdout, code = 0) => async () => ({ code, stdout, stderr: "" });

test("reads the network as reachable when either address family is", () => {
  assert.equal(isReachable(NETWORK_UP), true);
  assert.equal(isReachable(NETWORK_UP.replace("IPv4", "IPv6")), true);
});

test("reads the network as unreachable when no address family is", () => {
  assert.equal(isReachable(NETWORK_DOWN), false);
});

test("asks the system whether the network is up", async () => {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, args]);
    return { code: 0, stdout: NETWORK_UP, stderr: "" };
  };
  assert.equal(await isOnline({ exec }), true);
  assert.deepEqual(calls, [["/usr/sbin/scutil", ["--nwi"]]]);
  assert.equal(await isOnline({ exec: scutil(NETWORK_DOWN) }), false);
});

test("assumes the network is up when it cannot be asked", async () => {
  assert.equal(await isOnline({ exec: async () => { throw new Error("no such program"); } }), true);
  assert.equal(await isOnline({ exec: scutil("", 1) }), true);
  assert.equal(await isOnline({ exec: scutil("something unexpected") }), true);
});

test("loads no source while the network is down", async () => {
  let loads = 0;
  const counted = { ...working, load: async () => { loads += 1; return "raw"; } };
  assert.equal(await loadWhenOnline([counted], { exec: scutil(NETWORK_DOWN) }), null);
  assert.equal(loads, 0);
});

test("loads the sources while the network is up", async () => {
  assert.deepEqual(await loadWhenOnline([working], { exec: scutil(NETWORK_UP) }), [{ source: "notes", items: [note] }]);
});
