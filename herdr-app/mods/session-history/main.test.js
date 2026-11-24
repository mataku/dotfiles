import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["Input", "InputState", "ScrollHandle", "h_flex", "v_flex"],
  herdr: ["checking", "closeOverlay", "exec", "focused", "home", "panes", "props", "run", "spaces", "theme"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const {
  SOURCES, afterToggle, ageOf, commandOf, cursorOf, emptyTextOf, failureOf, filterSessions, groupSessions, hereOf, isInside, isRecent, labelOf, listHeightOf, loadAll, loadedOf,
  othersHintOf, outputOf, parseFiles, phraseOf, placesOf, rankSessions, revealOf, rootOf, rowsOf, searchAll, shownOf, spaceFor, splitMatch, statusOf, stepCursor, titleOf,
} = await import("./main.js");

const [claude] = SOURCES;
const ROOT = "/h/.claude/projects";
const RG_ARGS = ["--no-config", "--no-ignore", "--color", "never", "--no-heading", "--with-filename", "--no-line-number", "--max-columns", "4000", "--max-depth", "2", "--glob", "*.jsonl"];
const printed = (stdout) => ({ code: 0, stdout, stderr: "" });
const failed = (code, stderr = "") => ({ code, stdout: "", stderr });

function hostWith(answer) {
  const calls = [];
  const exec = async (program, args, options) => {
    calls.push({ program, args, options });
    return answer(program, args, options);
  };
  return { host: { exec, home: "/h" }, calls };
}

const sessionOf = (id, fields = {}) => ({ key: `claude:${id}`, source: "claude", id, path: `${ROOT}/-h-repo/${id}.jsonl`, folder: "/h/repo", title: id, prompt: "", updatedAt: 1, ...fields });
const many = (prefix, count, folder) => Array.from({ length: count }, (_, index) => sessionOf(`${prefix}${index + 1}`, { folder }));
const keysOf = (sessions) => sessions.map((session) => session.key);
const layoutOf = (inside, outside, wide, max = 200) => rowsOf(groupSessions([...many("in", inside, "/h/repo"), ...many("out", outside, "/h/other")], "/h/repo", "/h", wide), max);
const namesOf = (rows) => rows.map((row) => (row.group ? `# ${row.group.key}` : row.session.id));

test("parseFiles reads the time, the path and the id of each transcript", () => {
  const path = "/h/.claude/projects/-h-a/1111.jsonl";
  assert.deepEqual(parseFiles(`1790000000 2967 ${path}\n`), [{ path, id: "1111", updatedAt: 1790000000000 }]);
});

test("parseFiles skips blank, malformed and quoted lines", () => {
  const path = "/h/.claude/projects/-h-a/1111.jsonl";
  assert.deepEqual(parseFiles(["", "not a transcript", `"1790000000 2967 ${path}"`, ""].join("\n")), []);
});

test("splitMatch cuts at the first .jsonl:", () => {
  assert.deepEqual(splitMatch('/h/a/1.jsonl:{"x":"2.jsonl:3"}'), { path: "/h/a/1.jsonl", text: '{"x":"2.jsonl:3"}' });
  assert.equal(splitMatch("rg: something else"), null);
});

test("titleOf takes the custom title, then the generated one, then the prompt, then the agent name", () => {
  const all = { custom: "custom", generated: "generated", prompt: "prompt", name: "name" };
  assert.equal(titleOf(all), "custom");
  assert.equal(titleOf({ ...all, custom: "" }), "generated");
  assert.equal(titleOf({ ...all, custom: "", generated: undefined }), "prompt");
  assert.equal(titleOf({ name: "name" }), "name");
  assert.equal(titleOf({}), "");
});

test("titleOf reads as one line of at most 200 characters", () => {
  assert.equal(titleOf({ prompt: "first\n  second\tthird\u001b " }), "first second third");
  assert.equal(titleOf({ generated: "x".repeat(300) }), "x".repeat(200));
});

test("claude.parse builds sessions newest first from the five outputs", () => {
  const old = `${ROOT}/-h-a/old.jsonl`;
  const recent = `${ROOT}/-h-b/recent.jsonl`;
  const sessions = claude.parse({
    files: `100 10 ${old}\n200 10 ${recent}\n`,
    folders: `${old}:"cwd":"/h/a"\n${old}:"cwd":"/h/second"\n${recent}:"cwd":"/h/b"\n`,
    titles: `${old}:{"type":"ai-title","aiTitle":"Old title"}\n${recent}:not json\n`,
    prompts: `${recent}:{"type":"last-prompt","lastPrompt":"do\\nthis"}\n`,
    names: "",
  });
  assert.deepEqual(sessions, [
    { key: `claude:${recent}`, source: "claude", id: "recent", path: recent, folder: "/h/b", title: "do this", prompt: "do this", updatedAt: 200000 },
    { key: `claude:${old}`, source: "claude", id: "old", path: old, folder: "/h/a", title: "Old title", prompt: "", updatedAt: 100000 },
  ]);
});

test("claude.parse leaves out a transcript without a folder and one without a title", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => `${ROOT}/-h-a/${id}.jsonl`);
  const sessions = claude.parse({
    files: [a, b, c, d].map((path) => `100 10 ${path}`).join("\n"),
    folders: `${a}:"cwd":"/h/a"\n${b}:"cwd":"/h/a"\n${d}:"cwd":"relative"\n`,
    titles: [a, c, d].map((path) => `${path}:{"type":"ai-title","aiTitle":"Title"}`).join("\n"),
    prompts: "",
    names: "",
  });
  assert.deepEqual(sessions.map((session) => session.id), ["a"]);
});

test("claude.parse takes the last custom title and the first agent name", () => {
  const [a, b] = ["a", "b"].map((id) => `${ROOT}/-h-a/${id}.jsonl`);
  const sessions = claude.parse({
    files: `200 10 ${a}\n100 10 ${b}\n`,
    folders: `${a}:"cwd":"/h/a"\n${b}:"cwd":"/h/a"\n`,
    titles: `${a}:{"type":"ai-title","aiTitle":"Generated"}\n`,
    prompts: "",
    names: [
      `${a}:{"type":"custom-title","customTitle":"First"}`,
      `${a}:{"type":"custom-title","customTitle":"Last"}`,
      `${b}:{"type":"agent-name","agentName":"one"}`,
      `${b}:{"type":"agent-name","agentName":"two"}`,
    ].join("\n"),
  });
  assert.deepEqual(sessions.map((session) => session.title), ["Last", "one"]);
});

test("claude.parse tells two transcripts of one session id apart", () => {
  const [a, b] = ["-h-a", "-h-b"].map((bucket) => `${ROOT}/${bucket}/same.jsonl`);
  const sessions = claude.parse({
    files: `200 10 ${a}\n100 10 ${b}\n`,
    folders: `${a}:"cwd":"/h/a"\n${b}:"cwd":"/h/b"\n`,
    titles: [a, b].map((path) => `${path}:{"type":"ai-title","aiTitle":"Title"}`).join("\n"),
    prompts: "",
    names: "",
  });
  assert.deepEqual(sessions.map((session) => session.id), ["same", "same"]);
  assert.deepEqual(sessions.map((session) => session.key), [`claude:${a}`, `claude:${b}`]);
});

test("claude.load runs one find and four rg scans over the transcripts", async () => {
  const { host, calls } = hostWith(() => printed("out"));
  assert.deepEqual(await claude.load(host), { files: "out", folders: "out", titles: "out", prompts: "out", names: "out" });
  assert.equal(calls.length, 5);
  const [find, ...scans] = calls;
  assert.equal(find.program, "/usr/bin/find");
  assert.deepEqual(find.args, [ROOT, "-mindepth", "2", "-maxdepth", "2", "-type", "f", "-name", "*.jsonl", "-exec", "/usr/bin/stat", "-f", "%m %z %N", "{}", "+"]);
  for (const scan of scans) {
    assert.equal(scan.program, "rg");
    assert.deepEqual(scan.args.slice(0, RG_ARGS.length), RG_ARGS);
    assert.equal(scan.args.at(-1), ROOT);
  }
  assert.deepEqual(scans.map((scan) => scan.args.slice(RG_ARGS.length, -1)), [
    ["--only-matching", "--max-count", "1", "--regexp", String.raw`"cwd":"(?:[^"\\]|\\.)*"`],
    ["--max-count", "1", "--regexp", '"type":"ai-title"'],
    ["--max-count", "1", "--regexp", '"lastPrompt":"'],
    ["--regexp", '"type":"(custom-title|agent-name)"'],
  ]);
  assert.deepEqual(new Set(calls.map((call) => call.options.timeout)), new Set([15000]));
});

test("claude.load counts no match and no folder as empty", async () => {
  const { host } = hostWith((program) => (program === "rg" ? failed(1) : failed(1, `find: ${ROOT}: No such file or directory`)));
  assert.deepEqual(await claude.load(host), { files: "", folders: "", titles: "", prompts: "", names: "" });
});

test("claude.load rejects with the error rg prints", async () => {
  const { host } = hostWith((program) => (program === "rg" ? failed(2, "rg: boom\nmore") : printed("")));
  await assert.rejects(claude.load(host), { message: "rg: boom" });
});

test("loadAll reports each source's sessions or its error", async () => {
  const path = `${ROOT}/-h-a/a.jsonl`;
  const { host } = hostWith((program, args) => {
    if (program !== "rg") return printed(`100 10 ${path}\n`);
    if (args.includes("--only-matching")) return printed(`${path}:"cwd":"/h/a"\n`);
    return args.includes('"type":"ai-title"') ? printed(`${path}:{"aiTitle":"Title"}\n`) : failed(1);
  });
  const [loaded] = await loadAll(SOURCES, host);
  assert.equal(loaded.source, "claude");
  assert.deepEqual(loaded.sessions.map((session) => session.title), ["Title"]);
  const broken = hostWith(() => { throw new Error("`herdr.exec`: cannot run it: Permission denied"); });
  assert.deepEqual(await loadAll(SOURCES, broken.host), [{ source: "claude", error: "`herdr.exec`: cannot run it: Permission denied" }]);
});

test("loadedOf holds the sessions of the sources that loaded, newest first, and the failures of the others", () => {
  const [older, newer] = [sessionOf("older", { updatedAt: 1 }), sessionOf("newer", { updatedAt: 2 })];
  const failure = { label: "Claude Code", message: "rg was not found in PATH" };
  assert.deepEqual(loadedOf([{ source: "claude", sessions: [older, newer] }], SOURCES), { sessions: [newer, older], failures: [] });
  assert.deepEqual(loadedOf([{ source: "claude", error: "rg was not found in PATH" }], SOURCES), { sessions: [], failures: [failure] });
  const sources = [...SOURCES, { ...claude, id: "codex", label: "Codex" }];
  const results = [{ source: "codex", sessions: [older] }, { source: "claude", error: "rg was not found in PATH" }];
  assert.deepEqual(loadedOf(results, sources), { sessions: [older], failures: [failure] });
});

test("failureOf tells a missing program from a timeout and shows any other rejection as it is", () => {
  assert.equal(failureOf(new Error("`herdr.exec`: cannot run rg: No such file or directory (os error 2)"), "rg"), "rg was not found in PATH");
  assert.equal(failureOf(new Error("`herdr.exec`: rg took longer than 15 s and was stopped"), "rg"), "rg did not answer in time");
  assert.equal(failureOf(new Error("`herdr.exec`: cannot run rg: Permission denied"), "rg"), "`herdr.exec`: cannot run rg: Permission denied");
});

test("outputOf gives the output, nothing for a missing folder or no match, and throws otherwise", () => {
  assert.equal(outputOf(printed("out"), "rg"), "out");
  assert.equal(outputOf({ code: 2, stdout: "partial", stderr: "rg: one file failed" }, "rg"), "partial");
  assert.equal(outputOf(failed(2, "rg: /h/x: No such file or directory (os error 2)"), "rg"), "");
  assert.equal(outputOf(failed(1), "rg"), "");
  assert.throws(() => outputOf(failed(2, "rg: boom\nmore"), "rg"), { message: "rg: boom" });
  assert.throws(() => outputOf(failed(1), "/usr/bin/find"), { message: "/usr/bin/find exited with code 1" });
});

test("filterSessions matches every word across title, folder and prompt", () => {
  const sessions = [
    sessionOf("a", { title: "Add a Popup", folder: "/h/repo", prompt: "please write it" }),
    sessionOf("b", { title: "Other", folder: "/h/popup", prompt: "" }),
  ];
  const idsFor = (typed) => filterSessions(sessions, typed).map((session) => session.id);
  assert.deepEqual(idsFor("popup"), ["a", "b"]);
  assert.deepEqual(idsFor("WRITE popup repo"), ["a"]);
  assert.deepEqual(idsFor("popup nowhere"), []);
  assert.deepEqual(idsFor(""), ["a", "b"]);
});

test("phraseOf leaves out what is too short to be worth a search", () => {
  for (const typed of ["", "a", "ab", " ab ", "鍵"]) assert.equal(phraseOf(typed), null);
  assert.equal(phraseOf("abc"), "abc");
});

test("phraseOf takes two characters when one of them is not ASCII", () => {
  assert.equal(phraseOf("設計"), "設計");
  assert.equal(phraseOf(" 設計 "), "設計");
  assert.equal(phraseOf("aあ"), "aあ");
});

test("phraseOf writes the phrase as the transcript stores it", () => {
  assert.equal(phraseOf('say "hi"'), 'say \\"hi\\"');
});

test("claude.search looks for the phrase as fixed text and returns the paths", async () => {
  const { host, calls } = hostWith(() => printed(`${ROOT}/-h-a/a.jsonl\n${ROOT}/-h-a/b.jsonl\n`));
  assert.deepEqual(await claude.search(host, "the phrase"), [`${ROOT}/-h-a/a.jsonl`, `${ROOT}/-h-a/b.jsonl`]);
  assert.deepEqual(calls, [{
    program: "rg",
    args: ["--no-config", "--no-ignore", "--files-with-matches", "--ignore-case", "--fixed-strings", "--max-depth", "2", "--glob", "*.jsonl", "--regexp", "the phrase", ROOT],
    options: { timeout: 15000 },
  }]);
  assert.deepEqual(await claude.search(hostWith(() => failed(1)).host, "the phrase"), []);
});

test("searchAll joins the paths of the sources and reports the first error", async () => {
  const source = (search) => ({ ...claude, search });
  const found = await searchAll([
    source(async () => ["/a"]),
    source(async () => { throw new Error("boom"); }),
    source(async () => ["/a", "/b"]),
  ], {}, "phrase");
  assert.deepEqual(found, { paths: new Set(["/a", "/b"]), error: "boom" });
  assert.deepEqual(await searchAll([source(async () => [])], {}, "phrase"), { paths: new Set(), error: null });
});

test("rankSessions puts matches by title first and marks the ones found in the text", () => {
  const sessions = [sessionOf("text1"), sessionOf("word1"), sessionOf("text2"), sessionOf("word2"), sessionOf("none")];
  const found = new Set(["text1", "text2", "word2"].map((id) => `${ROOT}/-h-repo/${id}.jsonl`));
  const ranked = rankSessions(sessions, "word", found);
  assert.deepEqual(ranked.map((session) => [session.id, session.inText === true]), [["word1", false], ["word2", false], ["text1", true], ["text2", true]]);
  assert.deepEqual(rankSessions(sessions, "word", null).map((session) => session.id), ["word1", "word2"]);
  assert.deepEqual(rankSessions(sessions, "", null), sessions);
});

test("isInside accepts the folder and what is below it, not a sibling", () => {
  assert.equal(isInside("/a/repo", "/a/repo"), true);
  assert.equal(isInside("/a/repo/sub", "/a/repo"), true);
  assert.equal(isInside("/a/repo-two", "/a/repo"), false);
});

test("rootOf returns git's answer, and the folder when git has none", async () => {
  const { host, calls } = hostWith(() => printed("/h/repo\n"));
  assert.equal(await rootOf(host, "/h/repo/sub"), "/h/repo");
  assert.deepEqual(calls, [{ program: "git", args: ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"], options: { cwd: "/h/repo/sub", timeout: 5000 } }]);
  assert.equal(await rootOf(hostWith(() => failed(128, "fatal")).host, "/h/sub"), "/h/sub");
  assert.equal(await rootOf(hostWith(() => printed("\n")).host, "/h/sub"), "/h/sub");
  assert.equal(await rootOf(hostWith(() => { throw new Error("no such folder"); }).host, "/h/sub"), "/h/sub");
});

test("hereOf is the repository, and nothing without a folder or in the home folder", async () => {
  assert.equal(await hereOf(hostWith(() => printed("/h/repo\n")).host, "/h/repo/sub", "/h"), "/h/repo");
  assert.equal(await hereOf(hostWith(() => failed(128)).host, "/h", "/h"), null);
  const { host, calls } = hostWith(() => printed("/h/repo\n"));
  assert.equal(await hereOf(host, null, "/h"), null);
  assert.equal(calls.length, 0);
});

test("groupSessions splits the sessions by the repository and folds the other folders", () => {
  const [a, b, c] = [sessionOf("a"), sessionOf("b", { folder: "/h/other" }), sessionOf("c", { folder: "/h/repo/sub" })];
  const here = { key: "here", title: "~/repo", sessions: [a, c], folds: false, open: true };
  const other = { key: "other", title: "Other folders", sessions: [b], folds: true, open: false };
  assert.deepEqual(groupSessions([a, b, c], "/h/repo", "/h", false), [here, other]);
  assert.deepEqual(groupSessions([a, b, c], "/h/repo", "/h", true), [here, { ...other, open: true }]);
  assert.deepEqual(groupSessions([a, c], "/h/repo", "/h", false), [here]);
  assert.deepEqual(groupSessions([b], "/h/repo", "/h", false), [{ ...here, sessions: [] }, other]);
});

test("groupSessions has one group without a repository and none without sessions", () => {
  const sessions = [sessionOf("a"), sessionOf("b", { folder: "/h/other" }), sessionOf("c", { folder: "/h/repo/sub" })];
  const all = { key: "all", title: "All sessions", sessions, folds: false, open: true };
  assert.deepEqual(groupSessions(sessions, null, "/h", false), [all]);
  assert.deepEqual(groupSessions(sessions, null, "/h", true), [all]);
  assert.deepEqual(groupSessions([], "/h/repo", "/h", false), []);
  assert.deepEqual(groupSessions([], null, "/h", false), []);
});

test("rowsOf puts a heading before each open group's sessions", () => {
  assert.deepEqual(namesOf(layoutOf(2, 2, true)), ["# here", "in1", "in2", "# other", "out1", "out2"]);
  assert.deepEqual(namesOf(layoutOf(2, 2, false)), ["# here", "in1", "in2", "# other"]);
  assert.deepEqual(namesOf(layoutOf(0, 1, false)), ["# here", "# other"]);
});

test("rowsOf caps the session rows and keeps every heading", () => {
  assert.deepEqual(namesOf(layoutOf(2, 3, true, 3)), ["# here", "in1", "in2", "# other", "out1"]);
  assert.deepEqual(namesOf(layoutOf(3, 3, true, 2)), ["# here", "in1", "in2", "# other"]);
});

test("cursorOf keeps a listed cursor and otherwise goes to the first session", () => {
  assert.equal(cursorOf(["a", "b"], "b"), "b");
  assert.equal(cursorOf(["a", "b"], "gone"), "a");
  assert.equal(cursorOf(["a", "b"], null), "a");
  assert.equal(cursorOf([], "a"), null);
});

test("revealOf names the cursor's row, and the top for the first session", () => {
  const rows = layoutOf(20, 30, true);
  assert.equal(revealOf([], "claude:in1"), null);
  assert.equal(revealOf(rows, "claude:in1"), 0);
  assert.equal(revealOf(rows, null), 0);
  assert.equal(revealOf(rows, "claude:gone"), 0);
  assert.equal(revealOf(rows, "claude:in5"), 5);
  assert.equal(revealOf(rows, "claude:out1"), 22);
  assert.equal(revealOf(layoutOf(0, 30, true), "claude:out1"), 0);
});

test("afterToggle goes to the first session of the other folders after unfolding", () => {
  const rows = layoutOf(20, 30, true);
  assert.deepEqual(afterToggle(rows, true, "claude:in5"), { cursor: "claude:out1", reveal: 33 });
  assert.deepEqual(afterToggle(rows, true, null), { cursor: "claude:out1", reveal: 33 });
  assert.deepEqual(afterToggle(layoutOf(20, 3, true), true, "claude:in5"), { cursor: "claude:out1", reveal: 24 });
});

test("afterToggle keeps the cursor when no session of the other folders is listed", () => {
  assert.deepEqual(afterToggle(layoutOf(20, 30, true, 20), true, "claude:in5"), { cursor: "claude:in5", reveal: 21 });
  assert.deepEqual(afterToggle(layoutOf(20, 0, true), true, "claude:in5"), { cursor: "claude:in5", reveal: null });
});

test("afterToggle comes back to the repository's sessions after folding", () => {
  const rows = layoutOf(20, 30, false);
  assert.deepEqual(afterToggle(rows, false, "claude:out3"), { cursor: "claude:in1", reveal: 0 });
  assert.deepEqual(afterToggle(rows, false, "claude:in5"), { cursor: "claude:in5", reveal: 5 });
  assert.deepEqual(afterToggle(layoutOf(0, 30, false), false, "claude:out3"), { cursor: null, reveal: 0 });
});

test("shownOf counts the session rows the list holds", () => {
  assert.equal(shownOf(layoutOf(20, 30, false)), 20);
  assert.equal(shownOf(layoutOf(20, 30, true)), 50);
  assert.equal(shownOf(layoutOf(20, 30, true, 25)), 25);
});

test("othersHintOf says what the key shows or hides", () => {
  const groupsOf = (inside, outside, here, wide) => groupSessions([...many("in", inside, "/h/repo"), ...many("out", outside, "/h/other")], here, "/h", wide);
  assert.equal(othersHintOf([]), null);
  assert.equal(othersHintOf(groupsOf(20, 30, null, false)), null);
  assert.equal(othersHintOf(groupsOf(20, 0, "/h/repo", false)), null);
  assert.equal(othersHintOf(groupsOf(20, 30, "/h/repo", false)), "⌃O  30 in other folders");
  assert.equal(othersHintOf(groupsOf(20, 30, "/h/repo", true)), "⌃O  hide other folders");
});

test("listHeightOf adds up the rows, their gaps and the padding, up to a limit", () => {
  const rows = layoutOf(2, 1, true);
  assert.equal(listHeightOf(rows, 460), 28 + 30 + 30 + 28 + 30 + 4 + 12);
  assert.equal(listHeightOf(rows, 100), 100);
  assert.equal(listHeightOf([], 460), 0);
});

test("stepCursor moves through the ids and wraps", () => {
  const ids = ["a", "b", "c"];
  assert.equal(stepCursor(ids, "a", 1), "b");
  assert.equal(stepCursor(ids, "c", 1), "a");
  assert.equal(stepCursor(ids, "a", -1), "c");
});

test("stepCursor starts at an end when the cursor is not in the list", () => {
  assert.equal(stepCursor(["a", "b"], null, 1), "a");
  assert.equal(stepCursor(["a", "b"], "gone", -1), "b");
  assert.equal(stepCursor([], "a", 1), null);
});

test("statusOf says what the list is doing, then how much it shows", () => {
  const state = { failed: false, listed: true, searching: false, shown: 3, total: 3 };
  assert.equal(statusOf({ ...state, failed: true, searching: true }), "");
  assert.equal(statusOf({ ...state, listed: false }), "Loading…");
  assert.equal(statusOf({ ...state, searching: true }), "Searching transcripts…");
  assert.equal(statusOf(state), "3 sessions");
  assert.equal(statusOf({ ...state, shown: 2 }), "2 of 3");
});

test("emptyTextOf claims no more than the load knows", () => {
  const state = { listed: true, failures: 0, total: 5, searching: false, labels: ["Claude Code"] };
  assert.equal(emptyTextOf({ ...state, listed: false, total: 0 }), "Looking for sessions…");
  assert.equal(emptyTextOf({ ...state, listed: false, failures: 1, searching: true }), "Looking for sessions…");
  assert.equal(emptyTextOf({ ...state, total: 0, failures: 1 }), null);
  assert.equal(emptyTextOf({ ...state, total: 0 }), "No Claude Code sessions on this machine");
  assert.equal(emptyTextOf({ ...state, total: 0, labels: ["Claude Code", "Codex"] }), "No Claude Code or Codex sessions on this machine");
  assert.equal(emptyTextOf({ ...state, searching: true }), "Searching transcripts…");
  assert.equal(emptyTextOf(state), "No session matches");
  assert.equal(emptyTextOf({ ...state, failures: 1 }), "No session matches");
});

test("ageOf and isRecent measure from the last change", () => {
  const now = 1790000000000;
  const minute = 60 * 1000;
  assert.equal(ageOf(now - minute + 1, now), "now");
  assert.equal(ageOf(now - 5 * minute, now), "5m");
  assert.equal(ageOf(now - 3 * 60 * minute, now), "3h");
  assert.equal(ageOf(now - 49 * 60 * minute, now), "2d");
  assert.equal(isRecent(now - 23 * 60 * minute, now), true);
  assert.equal(isRecent(now - 24 * 60 * minute, now), false);
});

test("labelOf shortens the home folder", () => {
  assert.equal(labelOf("/h/repo", "/h"), "~/repo");
  assert.equal(labelOf("/h", "/h"), "~");
  assert.equal(labelOf("/home/repo", "/h"), "/home/repo");
});

test("placesOf takes a space's live folder before the one it was made in", () => {
  const space = (id, fields) => ({ id, machine: null, folder: "", active: false, tabs: [{ id: `${id}-tab` }], ...fields });
  const spaces = [
    space("live", { folder: "/h/made", active: true }),
    space("made", { folder: "/h/made" }),
    space("remote", { folder: "/h/remote", machine: "server" }),
    space("empty", {}),
  ];
  const panes = [{ tab: "live-tab", cwd: null }, { tab: "live-tab", cwd: "/h/live" }, { tab: "live-tab", cwd: "/h/later" }, { tab: "remote-tab", cwd: "/h/remote" }];
  assert.deepEqual(placesOf(spaces, panes), [{ id: "live", folder: "/h/live", active: true }, { id: "made", folder: "/h/made", active: false }]);
});

test("spaceFor finds the space of the session's repository", async () => {
  const roots = { "/h/dotfiles/herdr-app/mods": "/h/dotfiles", "/h": "/h" };
  const { host } = hostWith((_program, _args, { cwd }) => printed(`${roots[cwd]}\n`));
  const rooted = async (id, folder, active = false) => ({ id, root: await rootOf(host, folder), active });
  const sub = await rooted("sub", "/h/dotfiles/herdr-app/mods");
  const parent = await rooted("parent", "/h", true);
  assert.equal(spaceFor("/h/dotfiles", [parent, sub]), "sub");
  assert.equal(spaceFor("/h/dotfiles", [parent]), null);
  assert.equal(spaceFor("/h/dotfiles", [sub, { id: "shown", root: "/h/dotfiles", active: true }]), "shown");
  assert.equal(spaceFor("/h/dotfiles", [sub, { id: "later", root: "/h/dotfiles", active: false }]), "sub");
  assert.equal(spaceFor("/h/dotfiles", []), null);
});

test("commandOf opens a tab in a space and a new space on this computer", () => {
  const session = sessionOf("abc");
  const argv = ["claude", "--resume", "abc"];
  assert.deepEqual(commandOf(session, argv, "space1"), { name: "tab.new", args: { space: "space1", folder: "/h/repo", argv } });
  assert.deepEqual(commandOf(session, argv, null), { name: "space.new", args: { folder: "/h/repo", argv, machine: "" } });
});

test("a Claude Code session is resumed by its id", () => {
  assert.deepEqual(claude.resume({ id: "abc" }), ["claude", "--resume", "abc"]);
});
