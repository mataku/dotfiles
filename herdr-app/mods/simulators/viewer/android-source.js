import fs from "node:fs";
import http2 from "node:http2";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

import {
  adler32,
  buttonInput,
  createGrpcReader,
  endpointOf,
  grpcFrame,
  imageRequest,
  keyInputs,
  nextRotation,
  onCanvas,
  parseImage,
  rotationRequest,
  rpcPath,
  splitForDeflate,
  touchInput,
  wheelDrag,
  zlibStream,
} from "./android.js";
import { unturn } from "./screen.js";

const LOOPBACK = "127.0.0.1";
const RUNNING_DIR = path.join(os.homedir(), "Library", "Caches", "TemporaryItems", "avd", "running");
const COMPRESSION_LEVEL = 1;
const GRPC_OK = "0";
const WHEEL_FINGER = 1;
const QUARTER_TURNS = 4;
const WHEEL_REST_MS = 150;

const DEFLATE_PARTS = 4;

const deflateRaw = promisify(zlib.deflateRaw);

async function compress(pixels) {
  const parts = splitForDeflate(pixels, DEFLATE_PARTS);
  const deflated = parts.map((part, index) => {
    const finishFlush = index === parts.length - 1 ? zlib.constants.Z_FINISH : zlib.constants.Z_SYNC_FLUSH;
    return deflateRaw(part, { level: COMPRESSION_LEVEL, finishFlush });
  });
  return zlibStream(await Promise.all(deflated), adler32(pixels));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findEndpoint(serial) {
  let names;
  try {
    names = fs.readdirSync(RUNNING_DIR);
  } catch {
    return null;
  }
  const files = names.flatMap((name) => {
    try {
      return [{ name, text: fs.readFileSync(path.join(RUNNING_DIR, name), "utf8") }];
    } catch {
      return [];
    }
  });
  // Why filter by pid: an emulator that was killed leaves its file behind, and its ports may belong to a newer one.
  const live = files.filter(({ name }) => isAlive(Number(/\d+/.exec(name)?.[0])));
  return endpointOf(live, serial);
}

export async function openAndroidSource(serial, { onFrame, onDevice, onEnd, onStatus }) {
  onStatus("Connecting to the emulator…");
  const endpoint = findEndpoint(serial);
  if (!endpoint) throw new Error("no running emulator with that serial");

  let ended = false;
  const end = (reason) => {
    if (ended) return;
    ended = true;
    onEnd(reason);
  };

  const session = http2.connect(`http://${LOOPBACK}:${endpoint.port}`);
  session.on("error", () => end("the emulator connection failed"));
  session.on("close", () => end("the emulator connection closed"));
  const call = (method) => session.request({
    ":method": "POST",
    ":path": rpcPath(method),
    "content-type": "application/grpc",
    te: "trailers",
    authorization: `Bearer ${endpoint.token}`,
  });

  function unary(method, message) {
    return new Promise((resolve, reject) => {
      const stream = call(method);
      const reader = createGrpcReader();
      const replies = [];
      stream.on("data", (chunk) => {
        try {
          replies.push(...reader.push(chunk));
        } catch (error) {
          reject(error);
        }
      });
      stream.on("trailers", (trailers) => {
        if (trailers["grpc-status"] !== GRPC_OK) reject(new Error(`${method} failed: ${trailers["grpc-message"] ?? trailers["grpc-status"]}`));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(replies[0] ?? Buffer.alloc(0)));
      stream.end(grpcFrame(message));
    });
  }

  let display = null;
  let rotation = 0;
  let latest = null;
  let sequence = 0;
  let screenshots = null;
  let requested = null;
  let wheel = null;
  let wheelRest = null;

  async function measure() {
    const image = parseImage(await unary("getScreenshot", imageRequest({ width: 0, height: 0 })));
    if (!image) throw new Error("the emulator sent no screenshot");
    display = { width: image.width, height: image.height };
    rotation = image.rotation;
    onDevice(display);
  }

  function watch(target) {
    screenshots?.close();
    requested = target;
    const stream = call("streamScreenshot");
    const reader = createGrpcReader();
    screenshots = stream;
    stream.on("data", (chunk) => {
      let image;
      try {
        image = reader.push(chunk).map(parseImage).filter(Boolean).at(-1);
      } catch (error) {
        end(error.message);
        return;
      }
      if (!image) return;
      const arrivedAt = performance.now();
      latest = { ...image, sequence: ++sequence, arrivedAt };
      if (image.rotation !== rotation) {
        rotation = image.rotation;
        measure().catch((error) => end(error.message));
      }
      onFrame();
    });
    stream.on("error", () => {
      if (screenshots === stream) end("the screen stream failed");
    });
    stream.on("end", () => {
      if (screenshots === stream) end("the screen stream ended");
    });
    stream.end(grpcFrame(imageRequest(target)));
  }

  await measure();
  const input = call("streamInputEvent");
  input.on("error", () => end("the input stream failed"));
  const send = (message) => {
    if (message && !input.destroyed) input.write(grpcFrame(message));
  };

  // Why turn touches back: the emulator sends frames already turned upright, but takes touches in the screen's own unturned pixels.
  const turns = () => (QUARTER_TURNS - rotation) % QUARTER_TURNS;
  const natural = (touch) => ({ ...touch, ...unturn(turns(), touch.x, touch.y) });
  const naturalSize = () => (rotation % 2 === 1 ? { width: display.height, height: display.width } : display);

  function scrollBy(scroll) {
    clearTimeout(wheelRest);
    const step = wheelDrag(wheel, scroll);
    wheel = step.drag;
    for (const touch of step.touches) send(touchInput(natural(touch), naturalSize(), WHEEL_FINGER));
    if (wheel) wheelRest = setTimeout(() => scrollBy(null), WHEEL_REST_MS);
  }

  function act(action) {
    switch (action.type) {
      case "touch":
        send(touchInput(natural(action), naturalSize()));
        break;
      case "scroll":
        scrollBy(action);
        break;
      case "input":
        keyInputs(action.event).forEach(send);
        break;
      case "button":
        send(buttonInput(action.button));
        break;
      case "rotate":
        unary("setPhysicalModel", rotationRequest(nextRotation(rotation))).catch((error) => end(error.message));
        break;
      default:
        break;
    }
  }

  // Why a call of its own: the emulator scales frames itself, so each picture size is a stream of its own.
  function aim(fit) {
    const { width, height } = fit.picture;
    if (requested?.width !== width || requested?.height !== height) watch({ width, height });
  }

  async function render(fit, background) {
    const frame = latest;
    if (!frame) return null;
    const data = await compress(onCanvas(frame, fit, background));
    return { data, sequence: frame.sequence, arrivedAt: frame.arrivedAt };
  }

  function stop() {
    ended = true;
    clearTimeout(wheelRest);
    screenshots?.close();
    input.close();
    session.destroy();
  }

  return { latest: () => latest, aim, render, act, stop };
}
