import { isUdid } from "./ids.js";
import { unturn } from "./screen.js";

const SERVE_SIM_PACKAGE = "serve-sim@0.1.49";
const LOOPBACK = "127.0.0.1";
const MIN_PORT = 1024;
const MAX_PORT = 65535;

const TAG_TOUCH = 0x03;
const TAG_BUTTON = 0x04;
const TAG_KEY = 0x06;
const TAG_ROTATE = 0x07;
const TAG_SCROLL = 0x0b;
const TAG_CONFIG = 0x82;

const EDGE_NONE = 0;
const EDGE_BOTTOM = 3;
const BOTTOM_EDGE_START = 0.96;
const SCROLL_STEP = 0.06;
const SCALER_REQUEST_LENGTH = 16;

const BUTTONS = new Set(["home", "lock"]);
const ORIENTATIONS = ["portrait", "landscape_left", "portrait_upside_down", "landscape_right"];

const HEADER_END = Buffer.from("\r\n\r\n");
const MAX_HEADER_LENGTH = 65_536;
const MAX_FRAME_LENGTH = 64 * 1024 * 1024;
const CONTENT_LENGTH = /content-length:\s*(\d+)/i;

const USAGE_LEFT_CONTROL = 224;
const USAGE_LEFT_SHIFT = 225;
const USAGE_A = 4;
const USAGE_1 = 30;
const NAMED_KEY_USAGES = new Map([
  ["enter", 40], ["escape", 41], ["backspace", 42], ["tab", 43],
  ["home", 74], ["pageup", 75], ["delete", 76], ["end", 77], ["pagedown", 78],
  ["right", 79], ["left", 80], ["down", 81], ["up", 82],
]);
const PLAIN_SYMBOLS = " -=[]\\;'`,./";
const PLAIN_SYMBOL_USAGES = [44, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56];
const SHIFTED_DIGITS = "!@#$%^&*()";
const SHIFTED_SYMBOLS = "_+{}|:\"~<>?";
const SHIFTED_SYMBOL_USAGES = [45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56];

const isPort = (value) => Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
const message = (tag, body) => Buffer.concat([Buffer.from([tag]), Buffer.from(JSON.stringify(body), "utf8")]);

export function serverArguments(udid, port) {
  if (!isUdid(udid) || !isPort(port)) return null;
  return ["--yes", SERVE_SIM_PACKAGE, udid, "--port", String(port), "--host", LOOPBACK, "--exit-on-simulator-shutdown"];
}

export const streamUrl = (port, udid) => `http://${LOOPBACK}:${port}/helper/${udid}/stream.mjpeg`;
export const configUrl = (port, udid) => `http://${LOOPBACK}:${port}/helper/${udid}/config`;
export const socketUrl = (port, udid) => `ws://${LOOPBACK}:${port}/helper/${udid}/ws`;

export function parseServerState(text, udid) {
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    return null;
  }
  const local = state?.url === `http://${LOOPBACK}:${state?.port}`;
  if (state?.device !== udid || !local || !isPort(state.port) || !Number.isInteger(state.pid) || state.pid <= 1) return null;
  return { pid: state.pid, port: state.port };
}

export function scalerRequest({ jpegLength, fit, quarterTurns, background }) {
  const header = Buffer.alloc(SCALER_REQUEST_LENGTH);
  header.writeUInt32LE(jpegLength, 0);
  header.writeUInt16LE(fit.width, 4);
  header.writeUInt16LE(fit.height, 6);
  header.writeUInt16LE(fit.picture.width, 8);
  header.writeUInt16LE(fit.picture.height, 10);
  header.writeUInt8(quarterTurns, 12);
  header.set(background, 13);
  return header;
}

export function createMjpegReader() {
  let header = Buffer.alloc(0);
  let frame = null;
  let filled = 0;

  function push(chunk) {
    const frames = [];
    let at = 0;
    while (at < chunk.length) {
      if (frame === null) {
        header = Buffer.concat([header, chunk.subarray(at)]);
        at = chunk.length;
        const end = header.indexOf(HEADER_END);
        if (end < 0) {
          if (header.length > MAX_HEADER_LENGTH) throw new Error("stream part header never ends");
          break;
        }
        const length = Number(CONTENT_LENGTH.exec(header.toString("latin1", 0, end))?.[1]);
        if (!Number.isInteger(length) || length <= 0 || length > MAX_FRAME_LENGTH) throw new Error("stream part has no usable length");
        const rest = header.subarray(end + HEADER_END.length);
        header = Buffer.alloc(0);
        frame = Buffer.allocUnsafe(length);
        filled = 0;
        chunk = rest;
        at = 0;
        continue;
      }
      const taken = Math.min(frame.length - filled, chunk.length - at);
      chunk.copy(frame, filled, at, at + taken);
      filled += taken;
      at += taken;
      if (filled === frame.length) {
        frames.push(frame);
        frame = null;
      }
    }
    return frames;
  }

  return { push };
}

export function touchMessage(touch, activeEdge) {
  const startsAtBottom = touch.phase === "begin" && touch.y >= BOTTOM_EDGE_START;
  const edge = touch.phase === "begin" ? (startsAtBottom ? EDGE_BOTTOM : EDGE_NONE) : activeEdge ?? EDGE_NONE;
  const body = { type: touch.phase, x: touch.x, y: touch.y };
  return { message: message(TAG_TOUCH, edge === EDGE_NONE ? body : { ...body, edge }), edge };
}

export const buttonMessage = (button) => (BUTTONS.has(button) ? message(TAG_BUTTON, { button }) : null);
export const rotateMessage = (orientation) => (ORIENTATIONS.includes(orientation) ? message(TAG_ROTATE, { orientation }) : null);
export const scrollMessage = ({ dx, dy, x, y }) => message(TAG_SCROLL, { dx: dx * SCROLL_STEP, dy: dy * SCROLL_STEP, x, y });

export const quarterTurnsOf = (orientation) => Math.max(0, ORIENTATIONS.indexOf(orientation));
export const nextOrientation = (current) => ORIENTATIONS[(quarterTurnsOf(current) + 1) % ORIENTATIONS.length];

export const displayPlace = (orientation, x, y) => unturn(quarterTurnsOf(orientation), x, y);

function strokeOf(character) {
  const code = character.charCodeAt(0);
  if (character >= "a" && character <= "z") return { usage: USAGE_A + code - 97 };
  if (character >= "A" && character <= "Z") return { usage: USAGE_A + code - 65, modifier: USAGE_LEFT_SHIFT };
  if (character >= "1" && character <= "9") return { usage: USAGE_1 + code - 49 };
  if (character === "0") return { usage: USAGE_1 + 9 };
  const plain = PLAIN_SYMBOLS.indexOf(character);
  if (plain >= 0) return { usage: PLAIN_SYMBOL_USAGES[plain] };
  const digit = SHIFTED_DIGITS.indexOf(character);
  if (digit >= 0) return { usage: USAGE_1 + digit, modifier: USAGE_LEFT_SHIFT };
  const symbol = SHIFTED_SYMBOLS.indexOf(character);
  return symbol >= 0 ? { usage: SHIFTED_SYMBOL_USAGES[symbol], modifier: USAGE_LEFT_SHIFT } : null;
}

function strokesOf(event) {
  if (event.type === "text") return [...event.text].map(strokeOf).filter(Boolean);
  if (event.type !== "key") return [];
  if (event.ctrl) {
    const stroke = strokeOf(event.key);
    return stroke ? [{ usage: stroke.usage, modifier: USAGE_LEFT_CONTROL }] : [];
  }
  const usage = NAMED_KEY_USAGES.get(event.key);
  return usage === undefined ? [] : [{ usage }];
}

export function keyMessages(event) {
  const key = (type, usage) => message(TAG_KEY, { type, usage });
  return strokesOf(event).flatMap(({ usage, modifier }) => {
    const press = [key("down", usage), key("up", usage)];
    return modifier === undefined ? press : [key("down", modifier), ...press, key("up", modifier)];
  });
}

export function parseConfig(frame) {
  if (frame[0] !== TAG_CONFIG) return null;
  let config;
  try {
    config = JSON.parse(frame.subarray(1).toString("utf8"));
  } catch {
    return null;
  }
  if (!(config?.width > 0) || !(config.height > 0)) return null;
  return { width: config.width, height: config.height, orientation: ORIENTATIONS.includes(config.orientation) ? config.orientation : ORIENTATIONS[0] };
}
