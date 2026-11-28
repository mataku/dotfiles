import assert from "node:assert/strict";
import { test } from "node:test";

const { SOURCES, ageOf, createInbox, forSources, htmlUrlOf, isOnline, isReachable, keyOf, mergeResults, parseNotifications, pending, pruneDone, readDone, readState, resultOf, toItem } = await import("./main.js");
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
test("reads the network as reachable when either address family is", () => {
  assert.equal(isReachable(NETWORK_UP), true);
  assert.equal(isReachable(NETWORK_UP.replace("IPv4", "IPv6")), true);
});

test("reads the network as unreachable when no address family is", () => {
  assert.equal(isReachable(NETWORK_DOWN), false);
});

test("forgets items and errors of a source that is no longer registered", () => {
  const kept = item({ id: "1" });
  const gone = toItem("retired", { id: "a", title: "Old" });
  const state = { items: [kept, gone], errors: { github: "boom", retired: "old" }, fetchedAt: 9 };
  assert.deepEqual(forSources(state, ["github"]), { items: [kept], errors: { github: "boom" }, fetchedAt: 9 });
});


const ended = (over = {}) => ({ id: "x", code: 0, stdout: "", stderr: "", truncated: false, error: null, ...over });

test("reads the network as up when it cannot be asked", () => {
  assert.equal(isOnline(ended({ stdout: NETWORK_UP })), true);
  assert.equal(isOnline(ended({ stdout: NETWORK_DOWN })), false);
  assert.equal(isOnline(ended({ error: "not-found", code: null })), true);
  assert.equal(isOnline(ended({ code: 1 })), true);
});

test("turns what gh printed into items or an error", () => {
  assert.deepEqual(resultOf(github, ended({ stdout: JSON.stringify([notification()]) })).items.map((i) => i.id), ["100"]);
  assert.deepEqual(resultOf(github, ended({ code: 1, stderr: "gh: not logged in\n" })), { source: "github", error: "gh: not logged in" });
  assert.deepEqual(resultOf(github, ended({ code: 1 })), { source: "github", error: "gh exited with 1" });
  assert.deepEqual(resultOf(github, ended({ code: null, error: "not-found" })), { source: "github", error: "gh is not installed" });
  assert.equal(resultOf(github, ended({ stdout: '{"message":"Bad credentials"}' })).error, "GitHub did not return a list of notifications");
});

const node = (type) => (first, options) => ({ type, first, ...options });

function fakeNikol(files = {}) {
  const runs = [];
  const timers = [];
  const badges = [];
  const copied = [];
  const ui = Object.fromEntries(["column", "row", "text", "scroll", "icon", "spinner", "divider"].map((type) => [type, node(type)]));
  ui.button = (id, children, options) => ({ type: "button", id, children, ...options });
  return {
    runs,
    timers,
    badges,
    copied,
    files,
    ui,
    exec: (id, program, args, options) => runs.push({ id, program, args, options }),
    timer: { after: (millis, id) => timers.push({ millis, id }) },
    button: { badge: (on) => badges.push(on) },
    clipboard: { write: (text) => copied.push(text) },
    data: {
      read: (path) => files[path] ?? null,
      write: (path, text) => {
        files[path] = text;
        return true;
      },
    },
  };
}

const loadOnce = (mod, list) => {
  mod.event("exec", ended({ id: "network", stdout: NETWORK_UP }));
  mod.event("exec", ended({ id: "load:github", stdout: JSON.stringify(list) }));
};

test("is off until it is turned on, then loads and polls", () => {
  const nikol = fakeNikol();
  const mod = createInbox(nikol, () => 5000);
  mod.start();
  assert.deepEqual(nikol.runs, []);
  mod.event("click", { id: "switch" });
  assert.equal(nikol.files["settings.json"], '{"enabled":true}');
  assert.deepEqual(nikol.runs.map((r) => r.program), ["/usr/sbin/scutil"]);
  loadOnce(mod, [notification()]);
  assert.deepEqual(nikol.runs.map((r) => [r.program, ...r.args]).at(-1), ["gh", "api", "notifications?per_page=50"]);
  assert.deepEqual(mod.model.state.items.map((i) => i.id), ["100"]);
  assert.equal(JSON.parse(nikol.files["state.json"]).fetchedAt, 5000);
  assert.deepEqual(nikol.timers.at(-1), { millis: 300000, id: "poll:1" });
  assert.equal(nikol.badges.at(-1), true);
});

test("loads nothing while the network is down", () => {
  const nikol = fakeNikol({ "settings.json": '{"enabled":true}' });
  const mod = createInbox(nikol);
  mod.start();
  mod.event("exec", ended({ id: "network", stdout: NETWORK_DOWN }));
  assert.equal(nikol.runs.length, 1);
  assert.equal(mod.model.offline, true);
  assert.equal(mod.model.loading, false);
});

test("marking an item done hides it, keeps the mark and clears the dot", () => {
  const nikol = fakeNikol({ "settings.json": '{"enabled":true}' });
  const mod = createInbox(nikol);
  mod.start();
  loadOnce(mod, [notification()]);
  mod.event("click", { id: "done:github:100" });
  assert.deepEqual(JSON.parse(nikol.files["done.json"]), { "github:100": Date.parse("2026-11-20T14:01:59Z") });
  assert.equal(nikol.badges.at(-1), false);
  const again = createInbox(fakeNikol({ ...nikol.files }));
  again.start();
  assert.equal(pending(again.model.state.items, again.model.done).length, 0);
});

test("a click on a row copies its link and says so for a moment", () => {
  const nikol = fakeNikol({ "settings.json": '{"enabled":true}' });
  const mod = createInbox(nikol);
  mod.start();
  loadOnce(mod, [notification()]);
  mod.event("click", { id: "row:github:100" });
  assert.deepEqual(nikol.copied, ["https://github.com/acme/app/pull/12"]);
  assert.equal(mod.model.copied, "github:100");
  mod.event("timer", { id: "copied:github:100" });
  assert.equal(mod.model.copied, null);
});

test("a reload asked for while loading runs once the load ends", () => {
  const nikol = fakeNikol({ "settings.json": '{"enabled":true}' });
  const mod = createInbox(nikol);
  mod.start();
  mod.event("click", { id: "reload" });
  assert.equal(nikol.runs.length, 1);
  loadOnce(mod, []);
  assert.equal(nikol.runs.at(-1).program, "/usr/sbin/scutil");
  assert.equal(nikol.runs.length, 3);
});

test("turning it off stops polling", () => {
  const nikol = fakeNikol({ "settings.json": '{"enabled":true}' });
  const mod = createInbox(nikol);
  mod.start();
  loadOnce(mod, []);
  const poll = nikol.timers.at(-1).id;
  mod.event("click", { id: "switch" });
  const count = nikol.runs.length;
  mod.event("timer", { id: poll });
  assert.equal(nikol.runs.length, count);
});
