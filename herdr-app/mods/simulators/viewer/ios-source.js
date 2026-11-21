import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buttonMessage,
  configUrl,
  createMjpegReader,
  displayPlace,
  keyMessages,
  nextOrientation,
  parseConfig,
  parseServerState,
  quarterTurnsOf,
  rotateMessage,
  scalerRequest,
  scrollMessage,
  serverArguments,
  socketUrl,
  streamUrl,
  touchMessage,
} from "./ios.js";

const LOOPBACK = "127.0.0.1";
const CACHE_DIR = path.join(os.homedir(), ".cache", "herdr-simulators");
const SERVER_STATE_DIR = path.join(os.tmpdir(), "serve-sim");
const SCALER_SOURCE = fileURLToPath(new URL("./scaler.swift", import.meta.url));
const SCALER_PREFIX = "scaler-";
const SCALER_RESPONSE_HEADER_LENGTH = 8;
const COMPILE_TIMEOUT_MS = 180_000;
const SERVER_START_TIMEOUT_MS = 180_000;
const SERVER_POLL_MS = 250;
const PROBE_TIMEOUT_MS = 1_000;
const PRIVATE_DIRECTORY = 0o700;

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildScaler() {
  const digest = crypto.createHash("sha256").update(fs.readFileSync(SCALER_SOURCE)).digest("hex").slice(0, 16);
  const binary = path.join(CACHE_DIR, `${SCALER_PREFIX}${digest}`);
  if (fs.existsSync(binary)) return binary;
  fs.mkdirSync(CACHE_DIR, { recursive: true, mode: PRIVATE_DIRECTORY });
  const partial = `${binary}.${process.pid}.tmp`;
  try {
    await run("xcrun", ["swiftc", "-O", "-o", partial, SCALER_SOURCE], { timeout: COMPILE_TIMEOUT_MS });
    fs.renameSync(partial, binary);
  } finally {
    fs.rmSync(partial, { force: true });
  }
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (name.startsWith(SCALER_PREFIX) && path.join(CACHE_DIR, name) !== binary) fs.rmSync(path.join(CACHE_DIR, name), { force: true });
  }
  return binary;
}

function startScaler(binary, onExit) {
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });
  let received = [];
  let receivedLength = 0;
  let waiting = null;

  child.stdout.on("data", (chunk) => {
    received.push(chunk);
    receivedLength += chunk.length;
    if (!waiting || receivedLength < SCALER_RESPONSE_HEADER_LENGTH) return;
    const all = received.length === 1 ? received[0] : Buffer.concat(received);
    received = [all];
    const length = all.readUInt32LE(0);
    if (all.length < SCALER_RESPONSE_HEADER_LENGTH + length) return;
    const { resolve } = waiting;
    waiting = null;
    received = [];
    receivedLength = 0;
    resolve(length === 0 ? null : all.subarray(SCALER_RESPONSE_HEADER_LENGTH, SCALER_RESPONSE_HEADER_LENGTH + length));
  });
  child.stdin.on("error", () => {});
  child.on("exit", () => {
    waiting?.reject(new Error("the scaler stopped"));
    waiting = null;
    onExit();
  });

  function scale(jpeg, request) {
    return new Promise((resolve, reject) => {
      waiting = { resolve, reject };
      child.stdin.write(request);
      child.stdin.write(jpeg);
    });
  }

  return { scale, stop: () => child.kill("SIGKILL") };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen({ port: 0, host: LOOPBACK, exclusive: true }, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function answers(port, udid) {
  return new Promise((resolve) => {
    const request = http.get(configUrl(port, udid), { timeout: PROBE_TIMEOUT_MS }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const serverStateFile = (udid) => path.join(SERVER_STATE_DIR, `server-${udid}.json`);

function readServerState(udid) {
  try {
    return parseServerState(fs.readFileSync(serverStateFile(udid), "utf8"), udid);
  } catch {
    return null;
  }
}

async function startServer(udid, onExit) {
  const port = await freePort();
  const child = spawn("npx", serverArguments(udid, port), {
    cwd: os.tmpdir(),
    env: { ...process.env, SERVE_SIM_DISABLE_DEVICE_HUB_KEYBOARD: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let exited = false;
  child.on("error", () => { exited = true; });
  child.on("exit", () => { exited = true; onExit(); });

  // Why also by pid: npx is only a launcher, and a signal sent to it reaches the server only if npx is still there to pass it on.
  const stop = () => {
    const state = readServerState(udid);
    if (state?.port === port) {
      try {
        process.kill(state.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
      // Why remove it here: a server that dies with the terminal's hang-up never gets to remove its own state file.
      fs.rmSync(serverStateFile(udid), { force: true });
    }
    child.kill("SIGTERM");
  };

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (!(await answers(port, udid))) {
    if (exited || Date.now() > deadline) {
      stop();
      throw new Error("serve-sim did not start");
    }
    await sleep(SERVER_POLL_MS);
  }
  return { port, stop };
}

async function findOrStartServer(udid, onExit) {
  const running = readServerState(udid);
  if (running && isAlive(running.pid) && (await answers(running.port, udid))) {
    // Why stop is empty: this server was started by someone else and is theirs to stop.
    return { port: running.port, stop: () => {} };
  }
  return startServer(udid, onExit);
}

export async function openIosSource(udid, { onFrame, onDevice, onEnd, onStatus }) {
  let ended = false;
  const end = (reason) => {
    if (ended) return;
    ended = true;
    onEnd(reason);
  };

  onStatus("Preparing the image scaler…");
  const scaler = startScaler(await buildScaler(), () => end("the scaler stopped"));
  onStatus("Starting the simulator stream…");
  let server;
  try {
    server = await findOrStartServer(udid, () => end("the stream server stopped"));
  } catch (error) {
    scaler.stop();
    throw error;
  }

  let config = null;
  let latest = null;
  let sequence = 0;
  let edge = null;

  const socket = new WebSocket(socketUrl(server.port, udid));
  socket.binaryType = "arraybuffer";
  socket.addEventListener("message", (message) => {
    if (typeof message.data === "string") return;
    const parsed = parseConfig(Buffer.from(message.data));
    if (!parsed) return;
    config = parsed;
    onDevice(deviceOf(parsed));
  });
  socket.addEventListener("close", () => end("the input connection closed"));
  socket.addEventListener("error", () => end("the input connection failed"));

  const reader = createMjpegReader();
  const request = http.get(streamUrl(server.port, udid), (response) => {
    response.on("data", (chunk) => {
      let frames;
      try {
        frames = reader.push(chunk);
      } catch (error) {
        end(error.message);
        return;
      }
      const jpeg = frames.at(-1);
      // Why compare: the server repeats the last frame several times a second while the screen is still.
      if (!jpeg || (latest && jpeg.equals(latest.jpeg))) return;
      const arrivedAt = performance.now();
      latest = { jpeg, sequence: ++sequence, arrivedAt };
      onFrame();
    });
    response.on("end", () => end("the stream ended"));
    response.on("error", () => end("the stream failed"));
  });
  request.on("error", () => end("the stream failed"));

  // Why not turn every sideways device: its frames stay portrait and need turning, but a frame that already arrives wide must be left as it is.
  const turnsOf = (current) => {
    const turns = quarterTurnsOf(current.orientation);
    return turns % 2 === 1 && current.width > current.height ? 0 : turns;
  };
  function deviceOf(current) {
    const sideways = turnsOf(current) % 2 === 1;
    return { width: sideways ? current.height : current.width, height: sideways ? current.width : current.height };
  }
  const shownOrientation = () => (config && turnsOf(config) > 0 ? config.orientation : "portrait");

  const send = (message) => {
    if (message && socket.readyState === WebSocket.OPEN) socket.send(message);
  };

  function act(action) {
    switch (action.type) {
      case "touch": {
        const place = displayPlace(shownOrientation(), action.x, action.y);
        const touch = touchMessage({ phase: action.phase, ...place }, edge);
        edge = touch.edge;
        send(touch.message);
        break;
      }
      case "scroll": {
        const place = displayPlace(shownOrientation(), action.x, action.y);
        const origin = displayPlace(shownOrientation(), 0, 0);
        const delta = displayPlace(shownOrientation(), action.dx, action.dy);
        send(scrollMessage({ dx: delta.x - origin.x, dy: delta.y - origin.y, ...place }));
        break;
      }
      case "input":
        keyMessages(action.event).forEach(send);
        break;
      case "button":
        send(buttonMessage(action.button));
        break;
      case "rotate":
        send(rotateMessage(nextOrientation(config?.orientation)));
        break;
      default:
        break;
    }
  }

  async function render(fit, background) {
    const frame = latest;
    if (!frame || !config) return null;
    const request = scalerRequest({ jpegLength: frame.jpeg.length, fit, quarterTurns: turnsOf(config), background });
    const data = await scaler.scale(frame.jpeg, request);
    return data && { data, sequence: frame.sequence, arrivedAt: frame.arrivedAt };
  }

  function stop() {
    ended = true;
    request.destroy();
    socket.close();
    scaler.stop();
    server.stop();
  }

  return { latest: () => latest, aim: () => {}, render, act, stop };
}
