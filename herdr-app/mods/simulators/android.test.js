import assert from "node:assert/strict";
import { test } from "node:test";
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
} from "./viewer/android.js";

const hex = (buffer) => buffer.toString("hex");

test("asks for RGB frames of a given size", () => {
  assert.equal(hex(imageRequest({ width: 400, height: 870 })), "0802189003" + "20e606");
});

test("frames a message for gRPC and names the method", () => {
  assert.equal(hex(grpcFrame(Buffer.from([1, 2, 3]))), "0000000003010203");
  assert.equal(rpcPath("streamScreenshot"), "/android.emulation.control.EmulatorController/streamScreenshot");
});

test("splits a gRPC stream into messages, however the bytes arrive", () => {
  const first = Buffer.from([1, 2, 3]), second = Buffer.alloc(70_000, 5), empty = Buffer.alloc(0);
  const stream = Buffer.concat([grpcFrame(first), grpcFrame(second), grpcFrame(empty), grpcFrame(first)]);
  for (const size of [1, 4, 5, 6, 65_536, stream.length]) {
    const reader = createGrpcReader();
    const messages = [];
    for (let at = 0; at < stream.length; at += size) messages.push(...reader.push(stream.subarray(at, at + size)));
    assert.deepEqual(messages, [first, second, empty, first]);
  }
});

test("refuses compressed or oversized gRPC messages", () => {
  assert.throws(() => createGrpcReader().push(Buffer.from([1, 0, 0, 0, 1, 9])), /compressed/);
  assert.throws(() => createGrpcReader().push(Buffer.from([0, 0xff, 0xff, 0xff, 0xff])), /large/);
});

test("reads a frame's size, rotation and pixels", () => {
  const pixels = Buffer.alloc(2 * 3 * 3, 7);
  const format = Buffer.from("0802" + "12021001".replace("1001", "0801") + "1802" + "2003", "hex");
  const image = Buffer.concat([Buffer.from([0x0a, format.length]), format, Buffer.from([0x22, pixels.length]), pixels, Buffer.from([0x28, 0x09])]);
  assert.deepEqual(parseImage(image), { width: 2, height: 3, rotation: 1, pixels });
});

test("reads nothing from a frame without pixels or with the wrong amount", () => {
  const format = Buffer.from("080218022003", "hex");
  const withPixels = (count) => Buffer.concat([Buffer.from([0x0a, format.length]), format, Buffer.from([0x22, count]), Buffer.alloc(count)]);
  assert.equal(parseImage(withPixels(17)), null);
  assert.equal(parseImage(Buffer.from([0x0a, format.length, ...format])), null);
  assert.equal(parseImage(Buffer.from([0x0a, 0x7f, 1])), null);
  assert.equal(parseImage(Buffer.alloc(0)), null);
});

test("sends touches in device pixels, pressure down until the touch ends", () => {
  const size = { width: 720, height: 1280 };
  assert.equal(hex(touchInput({ phase: "begin", x: 0.5, y: 0.5 }, size)), "120a" + "0a08" + "08e802" + "108005" + "2001");
  assert.equal(hex(touchInput({ phase: "move", x: 1, y: 0 }, size)), "1207" + "0a05" + "08cf05" + "2001");
  assert.equal(hex(touchInput({ phase: "end", x: 0.5, y: 0.5 }, size)), "1208" + "0a06" + "08e802" + "108005");
});

test("types printable ASCII as text and named keys by their W3C names", () => {
  assert.deepEqual(keyInputs({ type: "text", text: "hi" }).map(hex), ["0a04" + "2a02" + "6869"]);
  assert.deepEqual(keyInputs({ type: "text", text: "日本" }), []);
  assert.deepEqual(keyInputs({ type: "text", text: "a日b" }).map(hex), ["0a04" + "2a02" + "6162"]);
  assert.deepEqual(keyInputs({ type: "key", key: "enter" }).map(hex), ["0a09" + "1002" + "2205" + Buffer.from("Enter").toString("hex")]);
  assert.deepEqual(keyInputs({ type: "key", key: "escape" }).map(hex), ["0a0a" + "1002" + "2206" + Buffer.from("GoBack").toString("hex")]);
  assert.deepEqual(keyInputs({ type: "key", key: "c", ctrl: true }), []);
  assert.deepEqual(keyInputs({ type: "key", key: "nothing" }), []);
});

test("presses the device's own buttons", () => {
  assert.equal(hex(buttonInput("home")), "0a0a" + "1002" + "2206" + Buffer.from("GoHome").toString("hex"));
  assert.equal(hex(buttonInput("lock")), "0a09" + "1002" + "2205" + Buffer.from("Power").toString("hex"));
  assert.equal(buttonInput("eject"), null);
});

test("gives a second finger its own identifier", () => {
  const size = { width: 720, height: 1280 };
  assert.equal(hex(touchInput({ phase: "begin", x: 0.5, y: 0.5 }, size, 1)), "120c" + "0a0a" + "08e802" + "108005" + "1801" + "2001");
});

test("scrolls with the wheel by dragging a finger from under the pointer", () => {
  const first = wheelDrag(null, { dx: 0, dy: 1, x: 0.5, y: 0.5 });
  assert.deepEqual(first.touches, [{ phase: "begin", x: 0.5, y: 0.5 }, { phase: "move", x: 0.5, y: 0.46 }]);
  const second = wheelDrag(first.drag, { dx: 0, dy: 1, x: 0.9, y: 0.9 });
  assert.deepEqual(second.touches.map((touch) => [touch.phase, touch.x, Number(touch.y.toFixed(6))]), [["move", 0.5, 0.42]]);
  const sideways = wheelDrag(null, { dx: -1, dy: 0, x: 0.5, y: 0.5 });
  assert.deepEqual(sideways.touches.at(-1), { phase: "move", x: 0.54, y: 0.5 });
});

test("lifts the finger at the screen's edge so the next turn starts again under the pointer", () => {
  const near = { x: 0.5, y: 0.07 };
  assert.deepEqual(wheelDrag(near, { dx: 0, dy: 1, x: 0.5, y: 0.5 }), { drag: null, touches: [{ phase: "end", x: 0.5, y: 0.07 }] });
  const fresh = wheelDrag(null, { dx: 0, dy: 1, x: 0.5, y: 0.06 });
  assert.deepEqual(fresh, { drag: null, touches: [] });
  assert.deepEqual(wheelDrag(near, null), { drag: null, touches: [{ phase: "end", x: 0.5, y: 0.07 }] });
  assert.deepEqual(wheelDrag(null, null), { drag: null, touches: [] });
});

test("rotates the device a quarter turn on from where it is", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(nextRotation), [90, 180, -90, 0, 90]);
  assert.equal(hex(rotationRequest(90)), "0801" + "1a0e" + "0a0c" + "00000000" + "00000000" + "0000b442");
});

const INI = [
  "emulator.build=15261927",
  "avd.id=Small_Phone_36",
  "port.serial=5554",
  "port.adb=5555",
  "cmdline=\"/path/qemu\" \"@Small_Phone_36\" \"-no-window\"",
  "grpc.token=abcDEF123+/=_-",
  "grpc.port=8554",
  "",
].join("\n");

test("finds a running emulator's gRPC endpoint by its serial", () => {
  const files = [
    { name: "pid_100.ini", text: INI.replace("port.serial=5554", "port.serial=5556").replace("grpc.port=8554", "grpc.port=8556") },
    { name: "notes.txt", text: INI },
    { name: "pid_35856.ini", text: INI },
  ];
  assert.deepEqual(endpointOf(files, "emulator-5554"), { pid: 35856, port: 8554, token: "abcDEF123+/=_-" });
  assert.deepEqual(endpointOf(files, "emulator-5556"), { pid: 100, port: 8556, token: "abcDEF123+/=_-" });
  assert.equal(endpointOf(files, "emulator-5558"), null);
  assert.equal(endpointOf([], "emulator-5554"), null);
});

test("ignores instance files with a port or token it cannot use", () => {
  const file = (text) => [{ name: "pid_35856.ini", text }];
  assert.equal(endpointOf(file(INI.replace("grpc.port=8554", "grpc.port=80")), "emulator-5554"), null);
  assert.equal(endpointOf(file(INI.replace("grpc.port=8554", "grpc.port=8554x")), "emulator-5554"), null);
  assert.equal(endpointOf(file(INI.replace("abcDEF123+/=_-", "abc def\r\nx-evil: 1")), "emulator-5554"), null);
  assert.equal(endpointOf(file(INI.replace("grpc.token=abcDEF123+/=_-\n", "")), "emulator-5554"), null);
  assert.equal(endpointOf(file("garbage"), "emulator-5554"), null);
});

test("places a frame on a canvas of the cell box, margins in the background color", () => {
  const frame = { width: 2, height: 1, pixels: Buffer.from([1, 2, 3, 4, 5, 6]) };
  const fit = { width: 4, height: 3, picture: { x: 1, y: 1, width: 2, height: 1 } };
  const margin = [9, 8, 7];
  assert.deepEqual([...onCanvas(frame, fit, margin)], [
    ...margin, ...margin, ...margin, ...margin,
    ...margin, 1, 2, 3, 4, 5, 6, ...margin,
    ...margin, ...margin, ...margin, ...margin,
  ]);
});

test("uses a frame that already fills the canvas as it is, and crops one that is larger than its place", () => {
  const exact = { width: 2, height: 1, pixels: Buffer.from([1, 2, 3, 4, 5, 6]) };
  assert.equal(onCanvas(exact, { width: 2, height: 1, picture: { x: 0, y: 0, width: 2, height: 1 } }, [0, 0, 0]), exact.pixels);
  const large = { width: 3, height: 2, pixels: Buffer.from([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]) };
  assert.deepEqual([...onCanvas(large, { width: 2, height: 1, picture: { x: 0, y: 0, width: 2, height: 1 } }, [0, 0, 0])], [1, 1, 1, 2, 2, 2]);
});

test("computes the Adler-32 checksum, long inputs included", () => {
  assert.equal(adler32(Buffer.from("Wikipedia")), 0x11e60398);
  assert.equal(adler32(Buffer.alloc(0)), 1);
  const long = Buffer.alloc(300_000, 0xff);
  const packed = zlib.deflateSync(long);
  assert.equal(adler32(long), packed.readUInt32BE(packed.length - 4));
});

test("splits pixels into parts and joins separately deflated parts into one zlib stream", () => {
  const pixels = Buffer.from(Array.from({ length: 100_000 }, (_, index) => (index * 7) % 251));
  const parts = splitForDeflate(pixels, 4);
  assert.equal(parts.length, 4);
  assert.deepEqual(Buffer.concat(parts), pixels);
  assert.deepEqual(splitForDeflate(Buffer.from([1, 2, 3]), 4), [Buffer.from([1, 2, 3])]);
  const deflated = parts.map((part, index) => zlib.deflateRawSync(part, { level: 1, finishFlush: index === parts.length - 1 ? zlib.constants.Z_FINISH : zlib.constants.Z_SYNC_FLUSH }));
  assert.deepEqual(zlib.inflateSync(zlibStream(deflated, adler32(pixels))), pixels);
});
