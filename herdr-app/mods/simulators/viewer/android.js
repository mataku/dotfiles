const SERVICE = "android.emulation.control.EmulatorController";
const GRPC_HEADER_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 256 * 1024 * 1024;

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_BYTES = 2;
const WIRE_FIXED32 = 5;

const FORMAT_RGB888 = 2;
const BYTES_PER_PIXEL = 3;
const ADLER_MODULUS = 65521;
const ADLER_RUN = 2048;
const MIN_DEFLATE_PART = 16_384;
const ZLIB_HEADER = Buffer.from([0x78, 0x01]);
const EVENT_KEYPRESS = 2;
const MODEL_ROTATION = 1;
const WHEEL_STEP = 0.04;
const WHEEL_MARGIN = 0.05;
const ROTATION_AFTER = [90, 180, -90, 0];

const INSTANCE_FILE = /^pid_(\d+)\.ini$/;
const TOKEN = /^[A-Za-z0-9+/=_-]{1,512}$/;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

const NAMED_KEYS = new Map([
  ["enter", "Enter"], ["backspace", "Backspace"], ["tab", "Tab"], ["escape", "GoBack"], ["delete", "Delete"],
  ["up", "ArrowUp"], ["down", "ArrowDown"], ["left", "ArrowLeft"], ["right", "ArrowRight"],
  ["home", "Home"], ["end", "End"], ["pageup", "PageUp"], ["pagedown", "PageDown"],
]);
const BUTTON_KEYS = new Map([["home", "GoHome"], ["lock", "Power"]]);
const UNPRINTABLE = /[^\x20-\x7e]/g;

function varint(value) {
  let rest = BigInt.asUintN(64, BigInt(value));
  const bytes = [];
  do {
    const low = Number(rest & 0x7fn);
    rest >>= 7n;
    bytes.push(rest > 0n ? low | 0x80 : low);
  } while (rest > 0n);
  return Buffer.from(bytes);
}

const key = (field, wire) => varint((field << 3) | wire);
const numberField = (field, value) => (value === 0 ? Buffer.alloc(0) : Buffer.concat([key(field, WIRE_VARINT), varint(value)]));
const bytesField = (field, body) => Buffer.concat([key(field, WIRE_BYTES), varint(body.length), body]);
const textField = (field, text) => bytesField(field, Buffer.from(text, "utf8"));

function* fieldsOf(buffer) {
  let at = 0;
  const readVarint = () => {
    let value = 0n;
    for (let shift = 0n; ; shift += 7n) {
      if (at >= buffer.length || shift > 63n) throw new RangeError("truncated varint");
      const byte = buffer[at++];
      value |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) return Number(BigInt.asIntN(64, value));
    }
  };
  while (at < buffer.length) {
    const tag = readVarint();
    const wire = tag & 7;
    if (wire === WIRE_VARINT) {
      yield [tag >> 3, wire, readVarint()];
      continue;
    }
    const length = wire === WIRE_BYTES ? readVarint() : wire === WIRE_FIXED64 ? 8 : wire === WIRE_FIXED32 ? 4 : -1;
    if (length < 0 || at + length > buffer.length) throw new RangeError("truncated field");
    yield [tag >> 3, wire, buffer.subarray(at, at + length)];
    at += length;
  }
}

export const rpcPath = (method) => `/${SERVICE}/${method}`;

export function grpcFrame(message) {
  const header = Buffer.alloc(GRPC_HEADER_LENGTH);
  header.writeUInt32BE(message.length, 1);
  return Buffer.concat([header, message]);
}

export function createGrpcReader() {
  let header = Buffer.alloc(0);
  let message = null;
  let filled = 0;

  function push(chunk) {
    const messages = [];
    let at = 0;
    while (at < chunk.length || (message !== null && filled === message.length)) {
      if (message === null) {
        const taken = Math.min(GRPC_HEADER_LENGTH - header.length, chunk.length - at);
        header = Buffer.concat([header, chunk.subarray(at, at + taken)]);
        at += taken;
        if (header.length < GRPC_HEADER_LENGTH) break;
        if (header[0] !== 0) throw new Error("compressed gRPC message");
        const length = header.readUInt32BE(1);
        if (length > MAX_MESSAGE_LENGTH) throw new Error("gRPC message too large");
        header = Buffer.alloc(0);
        message = Buffer.allocUnsafe(length);
        filled = 0;
        continue;
      }
      const taken = Math.min(message.length - filled, chunk.length - at);
      chunk.copy(message, filled, at, at + taken);
      filled += taken;
      at += taken;
      if (filled === message.length) {
        messages.push(message);
        message = null;
      }
    }
    return messages;
  }

  return { push };
}

export function imageRequest({ width, height }) {
  return Buffer.concat([numberField(1, FORMAT_RGB888), numberField(3, width), numberField(4, height)]);
}

// Why a canvas: the terminal blurs an image it has to resize to its cell box, so the frame goes onto one that is exactly that box, untouched.
export function onCanvas(frame, fit, background) {
  if (frame.width === fit.width && frame.height === fit.height) return frame.pixels;
  const canvas = Buffer.alloc(fit.width * fit.height * BYTES_PER_PIXEL).fill(Buffer.from(background));
  const copied = Math.min(frame.width, fit.width - fit.picture.x) * BYTES_PER_PIXEL;
  const rows = Math.min(frame.height, fit.height - fit.picture.y);
  for (let row = 0; row < rows; row += 1) {
    const from = row * frame.width * BYTES_PER_PIXEL;
    frame.pixels.copy(canvas, ((fit.picture.y + row) * fit.width + fit.picture.x) * BYTES_PER_PIXEL, from, from + copied);
  }
  return canvas;
}

export function adler32(bytes) {
  let low = 1;
  let high = 0;
  for (let start = 0; start < bytes.length; start += ADLER_RUN) {
    const end = Math.min(bytes.length, start + ADLER_RUN);
    for (let at = start; at < end; at += 1) {
      low += bytes[at];
      high += low;
    }
    low %= ADLER_MODULUS;
    high %= ADLER_MODULUS;
  }
  return ((high << 16) | low) >>> 0;
}

export function splitForDeflate(bytes, parts) {
  const count = Math.max(1, Math.min(parts, Math.floor(bytes.length / MIN_DEFLATE_PART)));
  const length = Math.ceil(bytes.length / count);
  return Array.from({ length: count }, (_, index) => bytes.subarray(index * length, (index + 1) * length));
}

// Why parts, each but the last ended on a sync flush: deflating a whole frame in one call takes longer than everything else done for it; parts run on separate threads.
export function zlibStream(deflatedParts, checksum) {
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(checksum);
  return Buffer.concat([ZLIB_HEADER, ...deflatedParts, trailer]);
}

export function parseImage(message) {
  const image = { width: 0, height: 0, rotation: 0, pixels: null };
  try {
    for (const [field, wire, value] of fieldsOf(message)) {
      if (field === 4 && wire === WIRE_BYTES) image.pixels = value;
      if (field !== 1 || wire !== WIRE_BYTES) continue;
      for (const [formatField, formatWire, formatValue] of fieldsOf(value)) {
        if (formatField === 3 && formatWire === WIRE_VARINT) image.width = formatValue;
        if (formatField === 4 && formatWire === WIRE_VARINT) image.height = formatValue;
        if (formatField !== 2 || formatWire !== WIRE_BYTES) continue;
        for (const [rotationField, rotationWire, rotationValue] of fieldsOf(formatValue)) {
          if (rotationField === 1 && rotationWire === WIRE_VARINT) image.rotation = rotationValue;
        }
      }
    }
  } catch {
    return null;
  }
  const complete = image.width > 0 && image.height > 0 && image.pixels?.length === image.width * image.height * BYTES_PER_PIXEL;
  return complete ? image : null;
}

const inputEvent = (field, body) => bytesField(field, body);
const keyboardEvent = (body) => inputEvent(1, body);
const keyPress = (name) => keyboardEvent(Buffer.concat([numberField(2, EVENT_KEYPRESS), textField(4, name)]));

export function touchInput(touch, size, identifier = 0) {
  const x = Math.min(size.width - 1, Math.round(touch.x * size.width));
  const y = Math.min(size.height - 1, Math.round(touch.y * size.height));
  const pressure = touch.phase === "end" ? 0 : 1;
  const contact = Buffer.concat([numberField(1, x), numberField(2, y), numberField(3, identifier), numberField(4, pressure)]);
  return inputEvent(2, bytesField(1, contact));
}

// Why not the emulator's own wheel event: a phone image has no mouse, and the event scrolls nothing there.
export function wheelDrag(drag, scroll) {
  const lift = drag ? [{ phase: "end", x: drag.x, y: drag.y }] : [];
  if (scroll === null) return { drag: null, touches: lift };
  const from = drag ?? { x: scroll.x, y: scroll.y };
  const to = { x: from.x - scroll.dx * WHEEL_STEP, y: from.y - scroll.dy * WHEEL_STEP };
  const inside = [to.x, to.y].every((value) => value >= WHEEL_MARGIN && value <= 1 - WHEEL_MARGIN);
  if (!inside) return { drag: null, touches: lift };
  return { drag: to, touches: [...(drag ? [] : [{ phase: "begin", ...from }]), { phase: "move", ...to }] };
}

export function keyInputs(event) {
  if (event.type === "text") {
    const text = event.text.replace(UNPRINTABLE, "");
    return text === "" ? [] : [keyboardEvent(textField(5, text))];
  }
  const name = event.type === "key" && !event.ctrl ? NAMED_KEYS.get(event.key) : undefined;
  return name === undefined ? [] : [keyPress(name)];
}

export function buttonInput(button) {
  const name = BUTTON_KEYS.get(button);
  return name === undefined ? null : keyPress(name);
}

export const nextRotation = (skinRotation) => ROTATION_AFTER[skinRotation] ?? ROTATION_AFTER[0];

export function rotationRequest(degrees) {
  const angles = Buffer.alloc(12);
  angles.writeFloatLE(degrees, 8);
  return Buffer.concat([numberField(1, MODEL_ROTATION), bytesField(3, bytesField(1, angles))]);
}

function parseIni(text) {
  const values = new Map();
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return values;
}

export function endpointOf(files, serial) {
  for (const { name, text } of files) {
    const pid = Number(INSTANCE_FILE.exec(name)?.[1]);
    if (!Number.isInteger(pid)) continue;
    const values = parseIni(text);
    const port = Number(values.get("grpc.port"));
    const token = values.get("grpc.token");
    if (`emulator-${values.get("port.serial")}` !== serial) continue;
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT || !TOKEN.test(token ?? "")) continue;
    return { pid, port, token };
  }
  return null;
}
