import { openAndroidSource } from "./android-source.js";
import { isSerial, isTty, isUdid } from "./ids.js";
import { openIosSource } from "./ios-source.js";
import { fitScreen, initialPointer, kittyDelete, kittyFrame, nextImage, resolvePointer, trackGesture } from "./screen.js";
import { openTerminal } from "./terminal.js";

const SOURCES = new Map([
  ["ios", { open: openIosSource, accepts: isUdid }],
  ["android", { open: openAndroidSource, accepts: isSerial }],
]);
const CONTROL_KEYS = new Map([
  ["h", { type: "button", button: "home" }],
  ["l", { type: "button", button: "lock" }],
  ["r", { type: "rotate" }],
]);
const QUIT_KEY = "q";

const ACK_TIMEOUT_MS = 1_000;
const FRAME_INTERVAL_MS = 1_000 / 60;
const STATS_WINDOW_MS = 2_000;
const STATS_REST_MS = 500;
const INPUT_ECHO_WINDOW_MS = 1_000;
const BLACK = [0, 0, 0];
const EXIT_USAGE = 64;

const [kind, id, ttyPath] = process.argv.slice(2);
const sourceKind = SOURCES.get(kind);
if (!sourceKind || !sourceKind.accepts(id) || !isTty(ttyPath)) {
  console.error("usage: viewer.js ios <udid> <tty> | viewer.js android <serial> <tty>");
  process.exit(EXIT_USAGE);
}

let source = null;
let grid = null;
let device = null;
let fit = null;
let background = BLACK;
let pointer = initialPointer();
let gesture = null;
let drawing = false;
let drawn = { sequence: 0, fit: null, background: null };
let shownImage = 0;
let statusShown = false;
let acknowledge = null;
let inputSentAt = null;
let statsTimer = null;
let closing = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emptyStats = () => ({ since: 0, frames: 0, renderMs: 0, writeMs: 0, ackMs: 0, latencyMs: 0, worstLatencyMs: 0, unacknowledged: 0, inputEchoMs: [] });
let stats = emptyStats();

function reportStats() {
  if (stats.frames === 0) return;
  const seconds = (performance.now() - stats.since) / 1000;
  const mean = (total) => (total / stats.frames).toFixed(1);
  const echo = stats.inputEchoMs.length > 0 ? `, input-to-draw ${stats.inputEchoMs.map((ms) => ms.toFixed(0)).join("/")} ms` : "";
  console.log(
    `[stats] ${stats.frames} frames in ${seconds.toFixed(1)} s (${(stats.frames / seconds).toFixed(1)} fps), ${fit?.picture.width}x${fit?.picture.height} px,` +
    ` render ${mean(stats.renderMs)} ms, write ${mean(stats.writeMs)} ms, ack ${mean(stats.ackMs)} ms,` +
    ` arrival-to-ack mean ${mean(stats.latencyMs)} ms, worst ${stats.worstLatencyMs.toFixed(0)} ms, unacknowledged ${stats.unacknowledged}${echo}`,
  );
  stats = emptyStats();
}

function shutdown(code, reason) {
  if (closing) return;
  closing = true;
  clearTimeout(statsTimer);
  if (reason) console.log(`[viewer] ${reason}`);
  reportStats();
  if (gesture) source?.act({ type: "touch", phase: "end", x: gesture.x, y: gesture.y });
  source?.stop();
  terminal.close();
  process.exit(code);
}

// Why a timeout: a terminal that is not on screen never answers, and drawing must not wait for it forever.
function acknowledged() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      acknowledge = null;
      resolve("silent");
    }, ACK_TIMEOUT_MS);
    acknowledge = (accepted) => {
      clearTimeout(timer);
      acknowledge = null;
      resolve(accepted ? "shown" : "refused");
    };
  });
}

function needsDrawing() {
  const frame = source?.latest();
  if (!frame || !fit) return false;
  return drawn.fit !== fit || drawn.background !== background || frame.sequence !== drawn.sequence;
}

async function drawOnce() {
  const target = fit;
  const color = background;
  const startedAt = performance.now();
  const picture = await source.render(target, color);
  if (!picture || target !== fit) return;
  const renderedAt = performance.now();
  if (statusShown) {
    statusShown = false;
    await terminal.clearText();
  }
  const reply = acknowledged();
  const image = nextImage(shownImage);
  await terminal.write(kittyFrame({ image, fit: target, data: picture.data }));
  const writtenAt = performance.now();
  const answer = await reply;
  const doneAt = performance.now();
  drawn = { sequence: picture.sequence, fit: target, background: color };
  // Why only now, and not for a refused picture: the old picture must stay on screen until the new one is, and a picture the terminal refused never will be.
  if (answer !== "refused") {
    if (shownImage !== 0) await terminal.write(kittyDelete(shownImage));
    shownImage = image;
  }

  if (stats.frames === 0) stats.since = startedAt;
  stats.frames += 1;
  stats.renderMs += renderedAt - startedAt;
  stats.writeMs += writtenAt - renderedAt;
  stats.ackMs += doneAt - writtenAt;
  stats.unacknowledged += answer === "shown" ? 0 : 1;
  stats.latencyMs += doneAt - picture.arrivedAt;
  stats.worstLatencyMs = Math.max(stats.worstLatencyMs, doneAt - picture.arrivedAt);
  if (inputSentAt !== null && picture.arrivedAt > inputSentAt) {
    stats.inputEchoMs.push(doneAt - inputSentAt);
    inputSentAt = null;
  }
  if (doneAt - stats.since > STATS_WINDOW_MS) reportStats();
}

// Why one frame at a time, waiting for the terminal's reply: frames that arrive meanwhile replace each other, so a slow terminal lowers the frame rate instead of growing a queue.
// Why also a pause: the simulator can produce frames faster than any display shows them, and every one drawn costs the scaler and Herdr a full image.
async function pump() {
  if (drawing) return;
  drawing = true;
  try {
    while (!closing && needsDrawing()) {
      const startedAt = performance.now();
      await drawOnce();
      const spare = FRAME_INTERVAL_MS - (performance.now() - startedAt);
      if (spare > 1) await sleep(spare);
    }
  } catch (error) {
    shutdown(1, `drawing failed: ${error.message}`);
  } finally {
    drawing = false;
  }
}

function onFrame() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(reportStats, STATS_REST_MS);
  pump();
}

function act(action) {
  if (!source) return;
  if (inputSentAt === null || performance.now() - inputSentAt > INPUT_ECHO_WINDOW_MS) inputSentAt = performance.now();
  source.act(action);
}

function refit() {
  if (gesture) act({ type: "touch", phase: "end", x: gesture.x, y: gesture.y });
  gesture = null;
  fit = grid && device ? fitScreen(grid, device) : null;
  if (!fit) return;
  source?.aim(fit);
  pump();
}

function onMouse(event) {
  if (!grid) return;
  const resolved = resolvePointer(pointer, event, grid);
  pointer = resolved.state;
  if (resolved.requestPixels) terminal.requestPixelReports();
  if (!fit) return;
  const tracked = trackGesture(gesture, event, resolved.point, fit, grid);
  gesture = tracked.state;
  tracked.actions.forEach(act);
}

function onTerminalEvent(event) {
  switch (event.type) {
    case "resize":
      if (!(event.cols > 0 && event.rows > 0 && event.width > 0 && event.height > 0)) return;
      grid = { cols: event.cols, rows: event.rows, cellWidth: event.width / event.cols, cellHeight: event.height / event.rows };
      refit();
      break;
    case "background":
      background = event.color;
      pump();
      break;
    case "graphics":
      acknowledge?.(event.ok);
      break;
    case "mouse":
      onMouse(event);
      break;
    case "key":
    case "text":
      act({ type: "input", event });
      break;
    case "closed":
      shutdown(0, "the terminal closed");
      break;
    default:
      break;
  }
}

const terminal = openTerminal(ttyPath, onTerminalEvent);
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(0, `stopped by ${signal}`));
// Why catch everything: dying without shutdown() would leave the stream server and the scaler running with nobody to stop them.
for (const failure of ["uncaughtException", "unhandledRejection"]) process.on(failure, (error) => shutdown(1, `failed: ${error?.message ?? error}`));

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("data", (chunk) => {
  for (const key of chunk.toString("latin1")) {
    if (key === QUIT_KEY) shutdown(0, "asked to quit");
    const action = CONTROL_KEYS.get(key);
    if (action) act(action);
  }
});

try {
  source = await sourceKind.open(id, {
    onFrame,
    onDevice: (size) => {
      device = size;
      refit();
    },
    onEnd: (reason) => shutdown(0, reason),
    onStatus: (text) => {
      if (drawn.fit) return;
      statusShown = true;
      terminal.showStatus(text);
    },
  });
  if (fit) source.aim(fit);
  pump();
} catch (error) {
  shutdown(1, `could not start: ${error.message}`);
}
