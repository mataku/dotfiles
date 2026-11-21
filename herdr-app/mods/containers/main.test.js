import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "svg"],
  "gpui-base": ["ScrollHandle", "h_flex", "v_flex"],
  herdr: ["checking", "closeOverlay", "exec", "props", "theme"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const { actionOf, clockOf, failureOf, formatPorts, groupContainers, listHeightOf, mergeStats, parseContainers, parseStats, rowsOf, stepCursor, summaryOf } = await import("./main.js");

const line = (fields) => JSON.stringify(fields);
const WEB = { ID: "aaa111", Names: "myapp-web-1", Image: "nginx:1.27", State: "running", Status: "Up 2 hours", Ports: "0.0.0.0:8080->80/tcp, :::8080->80/tcp", Labels: "com.docker.compose.project=myapp,com.docker.compose.service=web" };
const WORKER = { ID: "bbb222", Names: "myapp-worker-1", Image: "myapp-worker", State: "exited", Status: "Exited (0) 3 hours ago", Ports: "", Labels: "com.docker.compose.service=worker,com.docker.compose.project=myapp" };
const REDIS = { ID: "ccc333", Names: "redis", Image: "redis:7", State: "running", Status: "Up 5 days", Ports: "6379/tcp", Labels: "" };

test("parseContainers reads one container per line", () => {
  const containers = parseContainers([line(WEB), line(WORKER), line(REDIS)].join("\n"));
  assert.deepEqual(containers.map((c) => c.id), ["aaa111", "bbb222", "ccc333"]);
  assert.deepEqual(containers[0], { id: "aaa111", name: "myapp-web-1", image: "nginx:1.27", state: "running", active: true, status: "Up 2 hours", ports: "8080→80", project: "myapp" });
});

test("parseContainers finds the compose project wherever the label stands", () => {
  const [, worker, redis] = parseContainers([line(WEB), line(WORKER), line(REDIS)].join("\n"));
  assert.equal(worker.project, "myapp");
  assert.equal(redis.project, null);
});

test("parseContainers skips blank and broken lines and entries without an id", () => {
  const printed = ["", "not json", line({ Names: "no-id" }), line(REDIS), ""].join("\n");
  assert.deepEqual(parseContainers(printed).map((c) => c.name), ["redis"]);
});

test("parseContainers treats paused and restarting containers as active", () => {
  const states = ["running", "paused", "restarting", "exited", "created", "dead"];
  const containers = parseContainers(states.map((State, index) => line({ ...REDIS, ID: `id${index}`, State })).join("\n"));
  assert.deepEqual(containers.map((c) => c.active), [true, true, true, false, false, false]);
});

test("parseContainers replaces control characters in what it shows", () => {
  const [container] = parseContainers(line({ ...REDIS, Names: "re\u001b[31mdis", Status: "Up\n5 days" }));
  assert.equal(container.name, "re [31mdis");
  assert.equal(container.status, "Up 5 days");
});

test("formatPorts shows each published port once", () => {
  assert.equal(formatPorts("0.0.0.0:8080->80/tcp, :::8080->80/tcp"), "8080→80");
  assert.equal(formatPorts("0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 0.0.0.0:8443->443/tcp"), "8080→80, 8443→443");
});

test("formatPorts keeps exposed ports, udp and ranges", () => {
  assert.equal(formatPorts("5432/tcp"), "5432");
  assert.equal(formatPorts("0.0.0.0:53->53/udp"), "53→53/udp");
  assert.equal(formatPorts("0.0.0.0:8000-8002->8000-8002/tcp"), "8000-8002→8000-8002");
  assert.equal(formatPorts(""), "");
  assert.equal(formatPorts(undefined), "");
});

test("parseStats maps a container id to its cpu and memory", () => {
  const printed = [line({ ID: "aaa111", CPUPerc: "0.30%", MemUsage: "24.5MiB / 7.75GiB" }), line({ ID: "ccc333", CPUPerc: "1.20%", MemUsage: "180MiB / 7.75GiB" }), "broken"].join("\n");
  assert.deepEqual([...parseStats(printed)], [["aaa111", { cpu: "0.30%", memory: "24.5MiB" }], ["ccc333", { cpu: "1.20%", memory: "180MiB" }]]);
});

test("mergeStats matches ids of different lengths and leaves the rest without numbers", () => {
  const containers = parseContainers([line({ ...WEB, ID: "aaa111ffffff0000" }), line(WORKER)].join("\n"));
  const merged = mergeStats(containers, new Map([["aaa111ffffff", { cpu: "0.30%", memory: "24MiB" }]]));
  assert.equal(merged[0].cpu, "0.30%");
  assert.equal(merged[0].memory, "24MiB");
  assert.equal(merged[1].cpu, undefined);
});

test("groupContainers puts compose projects first by name and the rest last", () => {
  const extra = { ...REDIS, ID: "ddd444", Names: "api", Labels: "com.docker.compose.project=alpha" };
  const groups = groupContainers(parseContainers([line(REDIS), line(WEB), line(WORKER), line(extra)].join("\n")));
  assert.deepEqual(groups.map((g) => [g.key, g.title, g.containers.map((c) => c.name)]), [
    ["project:alpha", "alpha", ["api"]],
    ["project:myapp", "myapp", ["myapp-web-1", "myapp-worker-1"]],
    ["standalone", "standalone", ["redis"]],
  ]);
});

test("groupContainers lists active containers before stopped ones, then by name", () => {
  const stopped = { ...REDIS, ID: "eee555", Names: "a-stopped", State: "exited" };
  const other = { ...REDIS, ID: "fff666", Names: "b-running" };
  const [group] = groupContainers(parseContainers([line(stopped), line(REDIS), line(other)].join("\n")));
  assert.deepEqual(group.containers.map((c) => c.name), ["b-running", "redis", "a-stopped"]);
});

test("groupContainers returns nothing for no containers", () => {
  assert.deepEqual(groupContainers([]), []);
});

test("rowsOf lays out a heading before each group's containers", () => {
  const groups = groupContainers(parseContainers([line(WEB), line(REDIS)].join("\n")));
  assert.deepEqual(rowsOf(groups).map((row) => row.group?.key ?? row.container.id), ["project:myapp", "aaa111", "standalone", "ccc333"]);
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

test("summaryOf counts active and stopped containers", () => {
  const containers = parseContainers([line(WEB), line(WORKER), line(REDIS)].join("\n"));
  assert.equal(summaryOf(containers), "2 running · 1 stopped");
  assert.equal(summaryOf([]), "No containers");
});

test("actionOf stops an active container and starts a stopped one", () => {
  const [web, worker] = parseContainers([line(WEB), line(WORKER)].join("\n"));
  assert.deepEqual(actionOf(web), { label: "Stop", busy: "Stopping", args: ["stop", "aaa111"] });
  assert.deepEqual(actionOf(worker), { label: "Start", busy: "Starting", args: ["start", "bbb222"] });
});

test("failureOf tells a missing docker from a timeout and shows any other rejection as it is", () => {
  assert.equal(failureOf({ rejected: new Error("`herdr.exec`: cannot run docker: No such file or directory (os error 2)") }), "docker was not found in PATH");
  assert.equal(failureOf({ rejected: new Error("`herdr.exec`: docker took longer than 15 s and was stopped") }), "docker did not answer in time");
  assert.equal(failureOf({ rejected: new Error("`herdr.exec`: cannot run docker: Permission denied (os error 13)") }), "`herdr.exec`: cannot run docker: Permission denied (os error 13)");
  assert.equal(failureOf({ rejected: "" }), "docker could not be run");
});

test("failureOf tells a stopped daemon from another error", () => {
  const down = "failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory";
  assert.equal(failureOf({ result: { code: 1, stdout: "", stderr: down } }), "Docker is not running");
  assert.equal(failureOf({ result: { code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" } }), "Docker is not running");
  assert.equal(failureOf({ result: { code: 125, stdout: "", stderr: "permission denied\nmore" } }), "permission denied");
  assert.equal(failureOf({ result: { code: 2, stdout: "", stderr: "" } }), "docker exited with code 2");
  assert.equal(failureOf({ result: { code: 0, stdout: "", stderr: "" } }), null);
});

test("clockOf prints the time of day", () => {
  assert.equal(clockOf(new Date(2026, 10, 22, 9, 5, 7).getTime()), "09:05:07");
});

test("listHeightOf adds up the rows, their gaps and the padding, up to a limit", () => {
  const rows = rowsOf(groupContainers(parseContainers([line(WEB), line(WORKER), line(REDIS)].join("\n"))));
  assert.equal(listHeightOf(rows, 460), 28 + 30 + 30 + 28 + 30 + 4 + 12);
  assert.equal(listHeightOf(rows, 100), 100);
  assert.equal(listHeightOf([], 460), 0);
});
