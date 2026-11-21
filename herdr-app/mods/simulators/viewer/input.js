const ESC = 0x1b;
const BEL = 0x07;
const MAX_SEQUENCE_LENGTH = 4096;
const SIZE_REPORT = 48;
const BACKGROUND_REPORT = /^11;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i;

const WHEEL_BIT = 64;
const MOTION_BIT = 32;
const BUTTON_MASK = 3;
const WHEEL_DIRECTIONS = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

const CURSOR_KEYS = new Map([["A", "up"], ["B", "down"], ["C", "right"], ["D", "left"], ["H", "home"], ["F", "end"]]);
const TILDE_KEYS = new Map([[1, "home"], [3, "delete"], [4, "end"], [5, "pageup"], [6, "pagedown"], [7, "home"], [8, "end"]]);
const CONTROL_KEYS = new Map([[0x0d, "enter"], [0x0a, "enter"], [0x09, "tab"], [0x7f, "backspace"], [0x08, "backspace"]]);
const STRING_INTRODUCERS = new Set(["_", "]", "P", "^", "X"]);

const INCOMPLETE = Symbol("incomplete");
const isControl = (byte) => byte < 0x20 || byte === 0x7f;

function mouseEvent(parameters, final) {
  const numbers = parameters.slice(1).split(";").map(Number);
  if (numbers.length !== 3 || !numbers.every(Number.isInteger)) return null;
  const [code, x, y] = numbers;
  if (code & WHEEL_BIT) return { type: "mouse", action: "wheel", wheel: WHEEL_DIRECTIONS[code & BUTTON_MASK], x, y };
  const action = code & MOTION_BIT ? "move" : final === "M" ? "press" : "release";
  return { type: "mouse", action, button: code & BUTTON_MASK, x, y };
}

function csiEvent(parameters, final) {
  if (parameters.startsWith("<") && (final === "M" || final === "m")) return mouseEvent(parameters, final);
  const numbers = parameters.split(";").map(Number);
  if (final === "t" && numbers[0] === SIZE_REPORT && numbers.length === 5 && numbers.every(Number.isInteger)) {
    const [, rows, cols, height, width] = numbers;
    return { type: "resize", rows, cols, height, width };
  }
  const key = final === "~" ? TILDE_KEYS.get(numbers[0]) : /^[\d;]*$/.test(parameters) ? CURSOR_KEYS.get(final) : undefined;
  return key ? { type: "key", key } : null;
}

function backgroundEvent(body) {
  const channels = BACKGROUND_REPORT.exec(body)?.slice(1);
  if (!channels) return null;
  const color = channels.map((digits) => Math.round((parseInt(digits, 16) / (16 ** digits.length - 1)) * 255));
  return { type: "background", color };
}

function stringEvent(introducer, body) {
  if (introducer === "]") return backgroundEvent(body);
  if (introducer !== "_" || !body.startsWith("G")) return null;
  const message = body.slice(body.indexOf(";") + 1);
  return { type: "graphics", ok: message === "OK", message };
}

function readEscape(data, start) {
  if (start + 1 >= data.length) return INCOMPLETE;
  const introducer = String.fromCharCode(data[start + 1]);
  if (introducer === "[") {
    let end = start + 2;
    while (end < data.length && data[end] >= 0x20 && data[end] <= 0x3f) end += 1;
    if (end >= data.length) return INCOMPLETE;
    return [csiEvent(data.toString("latin1", start + 2, end), String.fromCharCode(data[end])), end + 1 - start];
  }
  if (introducer === "O") {
    if (start + 2 >= data.length) return INCOMPLETE;
    const key = CURSOR_KEYS.get(String.fromCharCode(data[start + 2]));
    return [key ? { type: "key", key } : null, 3];
  }
  if (STRING_INTRODUCERS.has(introducer)) {
    for (let end = start + 2; end < data.length; end += 1) {
      const terminated = data[end] === BEL ? 1 : data[end] === ESC && data[end + 1] === 0x5c ? 2 : 0;
      if (terminated) return [stringEvent(introducer, data.toString("latin1", start + 2, end)), end + terminated - start];
    }
    return INCOMPLETE;
  }
  return [{ type: "key", key: "escape" }, 1];
}

function incompleteUtf8Tail(data, start, end) {
  for (let back = 1; back <= 3 && end - back >= start; back += 1) {
    const byte = data[end - back];
    if ((byte & 0xc0) === 0x80) continue;
    const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return length > back ? back : 0;
  }
  return 0;
}

export function createInputParser() {
  let pending = Buffer.alloc(0);

  function push(chunk) {
    const data = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
    pending = Buffer.alloc(0);
    const events = [];
    let at = 0;
    while (at < data.length) {
      const byte = data[at];
      if (byte === ESC) {
        const read = readEscape(data, at);
        if (read === INCOMPLETE) {
          if (data.length - at <= MAX_SEQUENCE_LENGTH) pending = data.subarray(at);
          break;
        }
        if (read[0]) events.push(read[0]);
        at += read[1];
      } else if (isControl(byte)) {
        const key = CONTROL_KEYS.get(byte);
        if (key) events.push({ type: "key", key });
        else if (byte !== 0) events.push({ type: "key", key: String.fromCharCode(byte + 0x60), ctrl: true });
        at += 1;
      } else {
        let end = at;
        while (end < data.length && !isControl(data[end])) end += 1;
        const held = end === data.length ? incompleteUtf8Tail(data, at, end) : 0;
        if (end - held > at) events.push({ type: "text", text: data.toString("utf8", at, end - held) });
        if (held > 0) pending = data.subarray(end - held);
        at = end;
      }
    }
    return events;
  }

  // Why a separate call: a lone ESC is the Escape key only if nothing follows it, and only the caller knows when it has waited long enough.
  function flush() {
    const lone = pending.length === 1 && pending[0] === ESC;
    pending = Buffer.alloc(0);
    return lone ? [{ type: "key", key: "escape" }] : [];
  }

  return { push, flush };
}
