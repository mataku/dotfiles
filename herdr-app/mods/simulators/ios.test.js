import assert from "node:assert/strict";
import { test } from "node:test";

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
  streamUrl,
  socketUrl,
  touchMessage,
} from "./viewer/ios.js";

const UDID = "71E66660-C8B7-447B-AF87-531431BF3F50";
const bodyOf = (message) => JSON.parse(message.subarray(1).toString("utf8"));

test("starts the pinned serve-sim for one simulator on a loopback port", () => {
  assert.deepEqual(serverArguments(UDID, 3190), ["--yes", "serve-sim@0.1.49", UDID, "--port", "3190", "--host", "127.0.0.1", "--exit-on-simulator-shutdown"]);
  assert.equal(serverArguments("--help", 3190), null);
  assert.equal(serverArguments(UDID, 80), null);
  assert.equal(serverArguments(UDID, "3190; x"), null);
});

test("addresses the stream and the input socket on loopback only", () => {
  assert.equal(streamUrl(3190, UDID), `http://127.0.0.1:3190/helper/${UDID}/stream.mjpeg`);
  assert.equal(configUrl(3190, UDID), `http://127.0.0.1:3190/helper/${UDID}/config`);
  assert.equal(socketUrl(3190, UDID), `ws://127.0.0.1:3190/helper/${UDID}/ws`);
});

test("reads a server's state file for the right simulator only", () => {
  const state = { pid: 34379, port: 3190, device: UDID, url: "http://127.0.0.1:3190", streamUrl: "x", wsUrl: "y" };
  assert.deepEqual(parseServerState(JSON.stringify(state), UDID), { pid: 34379, port: 3190 });
  assert.equal(parseServerState(JSON.stringify({ ...state, device: "8AF905E9-8045-4CA8-86E7-BF15F3306525" }), UDID), null);
  assert.equal(parseServerState(JSON.stringify({ ...state, url: "http://192.168.4.25:3190" }), UDID), null);
  assert.equal(parseServerState(JSON.stringify({ ...state, port: "3190" }), UDID), null);
  assert.equal(parseServerState(JSON.stringify({ ...state, pid: -1 }), UDID), null);
  assert.equal(parseServerState("{", UDID), null);
  assert.equal(parseServerState(null, UDID), null);
});

const part = (jpeg) => Buffer.concat([Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`), jpeg, Buffer.from("\r\n")]);

test("splits the stream into JPEG frames, however the bytes arrive", () => {
  const first = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const second = Buffer.alloc(3000, 9);
  const stream = Buffer.concat([part(first), part(second), part(first)]);
  const whole = createMjpegReader();
  assert.deepEqual(whole.push(stream), [first, second, first]);
  for (const size of [1, 7, 64, 1000]) {
    const reader = createMjpegReader();
    const frames = [];
    for (let at = 0; at < stream.length; at += size) frames.push(...reader.push(stream.subarray(at, at + size)));
    assert.deepEqual(frames, [first, second, first]);
  }
});

test("stops reading a stream whose part has no usable length", () => {
  const reader = createMjpegReader();
  assert.throws(() => reader.push(Buffer.from("--frame\r\nContent-Type: image/jpeg\r\n\r\nabc")), /length/);
  const huge = createMjpegReader();
  assert.throws(() => huge.push(Buffer.from("--frame\r\nContent-Length: 999999999999\r\n\r\n")), /length/);
  const endless = createMjpegReader();
  assert.throws(() => endless.push(Buffer.alloc(70_000, 0x41)), /header/);
});

test("encodes touches with the bottom edge marked for the whole gesture", () => {
  const begin = touchMessage({ phase: "begin", x: 0.5, y: 0.99 }, null);
  assert.equal(begin.message[0], 0x03);
  assert.deepEqual(bodyOf(begin.message), { type: "begin", x: 0.5, y: 0.99, edge: 3 });
  const move = touchMessage({ phase: "move", x: 0.5, y: 0.4 }, begin.edge);
  assert.deepEqual(bodyOf(move.message), { type: "move", x: 0.5, y: 0.4, edge: 3 });
  const plain = touchMessage({ phase: "begin", x: 0.25, y: 0.5 }, 3);
  assert.deepEqual(bodyOf(plain.message), { type: "begin", x: 0.25, y: 0.5 });
  assert.equal(plain.edge, 0);
});

test("encodes buttons, rotation and scrolling", () => {
  assert.deepEqual([buttonMessage("home")[0], bodyOf(buttonMessage("home"))], [0x04, { button: "home" }]);
  assert.deepEqual(bodyOf(buttonMessage("lock")), { button: "lock" });
  assert.equal(buttonMessage("rm -rf"), null);
  assert.deepEqual([rotateMessage("landscape_left")[0], bodyOf(rotateMessage("landscape_left"))], [0x07, { orientation: "landscape_left" }]);
  assert.equal(rotateMessage("sideways"), null);
  const scroll = scrollMessage({ dx: 0, dy: -1, x: 0.5, y: 0.25 });
  assert.equal(scroll[0], 0x0b);
  assert.deepEqual(bodyOf(scroll), { dx: 0, dy: -0.06, x: 0.5, y: 0.25 });
});

test("steps through the four orientations", () => {
  assert.deepEqual(["portrait", "landscape_left", "portrait_upside_down", "landscape_right", "junk"].map(nextOrientation), [
    "landscape_left", "portrait_upside_down", "landscape_right", "portrait", "landscape_left",
  ]);
});

test("types text as key presses, holding shift where a US keyboard needs it", () => {
  const strokes = (event) => keyMessages(event).map((message) => { const body = bodyOf(message); return `${body.type}:${body.usage}`; });
  assert.equal(keyMessages({ type: "text", text: "a" })[0][0], 0x06);
  assert.deepEqual(strokes({ type: "text", text: "a1 " }), ["down:4", "up:4", "down:30", "up:30", "down:44", "up:44"]);
  assert.deepEqual(strokes({ type: "text", text: "A!" }), ["down:225", "down:4", "up:4", "up:225", "down:225", "down:30", "up:30", "up:225"]);
  assert.deepEqual(strokes({ type: "text", text: "-_/?" }), ["down:45", "up:45", "down:225", "down:45", "up:45", "up:225", "down:56", "up:56", "down:225", "down:56", "up:56", "up:225"]);
  assert.deepEqual(strokes({ type: "text", text: "日本" }), []);
});

test("sends named keys and control chords as key presses", () => {
  const strokes = (event) => keyMessages(event).map((message) => { const body = bodyOf(message); return `${body.type}:${body.usage}`; });
  assert.deepEqual(strokes({ type: "key", key: "enter" }), ["down:40", "up:40"]);
  assert.deepEqual(strokes({ type: "key", key: "backspace" }), ["down:42", "up:42"]);
  assert.deepEqual(["escape", "tab", "right", "left", "down", "up", "home", "end", "delete", "pageup", "pagedown"].map((key) => bodyOf(keyMessages({ type: "key", key })[0]).usage), [41, 43, 79, 80, 81, 82, 74, 77, 76, 75, 78]);
  assert.deepEqual(strokes({ type: "key", key: "a", ctrl: true }), ["down:224", "down:4", "up:4", "up:224"]);
  assert.deepEqual(strokes({ type: "key", key: "nothing" }), []);
});

test("reads the screen's size and orientation from a config message", () => {
  const frame = (body) => Buffer.concat([Buffer.from([0x82]), Buffer.from(JSON.stringify(body))]);
  assert.deepEqual(parseConfig(frame({ width: 1206, height: 2622, orientation: "portrait" })), { width: 1206, height: 2622, orientation: "portrait" });
  assert.deepEqual(parseConfig(frame({ width: 1206, height: 2622, orientation: "odd" })), { width: 1206, height: 2622, orientation: "portrait" });
  assert.equal(parseConfig(frame({ width: 0, height: 2622 })), null);
  assert.equal(parseConfig(Buffer.from([0x03, 0x7b, 0x7d])), null);
  assert.equal(parseConfig(Buffer.from([0x82, 0x7b])), null);
});

test("shows a rotated device upright and sends touches back in the device's own frame", () => {
  assert.deepEqual(["portrait", "landscape_left", "portrait_upside_down", "landscape_right"].map(quarterTurnsOf), [0, 1, 2, 3]);
  assert.deepEqual(displayPlace("portrait", 0.2, 0.7), { x: 0.2, y: 0.7 });
  assert.deepEqual(displayPlace("portrait_upside_down", 0.2, 0.7), { x: 0.8, y: 0.30000000000000004 });
  const left = displayPlace("landscape_left", 0.2, 0.7), right = displayPlace("landscape_right", 0.2, 0.7);
  assert.deepEqual([left, right], [{ x: 0.7, y: 0.8 }, { x: 0.30000000000000004, y: 0.2 }]);
});

test("asks the scaler for a picture centred on a canvas of the cell box, turned as the device is", () => {
  const header = scalerRequest({ jpegLength: 0x01020304, fit: { width: 616, height: 1334, picture: { x: 6, y: 11, width: 603, height: 1311 } }, quarterTurns: 3, background: [0x28, 0x31, 0x37] });
  assert.equal(header.toString("hex"), "04030201" + "6802" + "3605" + "5b02" + "1f05" + "03" + "283137");
});
