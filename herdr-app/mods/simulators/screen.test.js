import assert from "node:assert/strict";
import { test } from "node:test";

import { fitScreen, initialPointer, kittyClear, kittyDelete, kittyFrame, locate, nextImage, resolvePointer, statusBytes, trackGesture, unturn } from "./viewer/screen.js";

const GRID = { cols: 53, rows: 46, cellWidth: 14, cellHeight: 29 };
const IPHONE = { width: 1206, height: 2622 };

const boxed = (col, row, cols, rows) => ({ col, row, cols, rows, width: cols * 14, height: rows * 29, picture: { x: 0, y: 0, width: cols * 14, height: rows * 29 } });

test("shows a screen at exactly half its pixels when that nearly fills the grid, centred in whole cells", () => {
  assert.deepEqual(fitScreen(GRID, IPHONE), { col: 4, row: 0, cols: 44, rows: 46, width: 616, height: 1334, picture: { x: 6, y: 11, width: 603, height: 1311 } });
});

test("keeps the screen's shape at any other size, and never enlarges it", () => {
  assert.deepEqual(fitScreen(GRID, { width: 2622, height: 1206 }), { col: 0, row: 17, cols: 53, rows: 12, width: 742, height: 348, picture: { x: 0, y: 3, width: 742, height: 341 } });
  assert.deepEqual(fitScreen(GRID, { width: 720, height: 1280 }), { col: 0, row: 0, cols: 52, rows: 45, width: 728, height: 1305, picture: { x: 4, y: 12, width: 720, height: 1280 } });
  const narrow = fitScreen({ ...GRID, cols: 30 }, IPHONE);
  assert.deepEqual([narrow.picture.width, narrow.picture.height, narrow.cols, narrow.rows], [402, 874, 29, 31]);
  assert.ok(Math.abs(narrow.picture.width / narrow.picture.height - IPHONE.width / IPHONE.height) < 0.002);
});

test("fits nothing when the grid or the screen has no size", () => {
  assert.equal(fitScreen({ ...GRID, cols: 0 }, IPHONE), null);
  assert.equal(fitScreen({ ...GRID, cellWidth: 0 }, IPHONE), null);
  assert.equal(fitScreen(GRID, { width: 0, height: 10 }), null);
  assert.equal(fitScreen(GRID, { width: NaN, height: 10 }), null);
});

const apcOf = (bytes) => bytes.toString("latin1").split("\x1b\\").filter(Boolean);

test("draws a small frame as one graphics command at the fitted cells", () => {
  const data = Buffer.from("compressed");
  const text = kittyFrame({ image: 2, fit: boxed(4, 2, 44, 40), data }).toString("latin1");
  assert.equal(text, `\x1b[3;5H\x1b_Ga=T,f=24,o=z,i=2,p=1,C=1,s=616,v=1160,c=44,r=40,m=0;${data.toString("base64")}\x1b\\`);
});

test("splits a large frame into 4096-character chunks, keys on the first only", () => {
  const data = Buffer.alloc(7000, 7);
  const commands = apcOf(kittyFrame({ image: 1, fit: boxed(0, 0, 2, 2), data }));
  assert.equal(commands.length, 3);
  assert.match(commands[0], /^\x1b\[1;1H\x1b_Ga=T,.*,m=1;[A-Za-z0-9+/]{4096}$/);
  assert.match(commands[1], /^\x1b_Gm=1;[A-Za-z0-9+/]{4096}$/);
  assert.match(commands[2], /^\x1b_Gm=0;[A-Za-z0-9+/=]+$/);
  assert.deepEqual(Buffer.from(commands.map((command) => command.slice(command.indexOf(";", command.indexOf("_G")) + 1)).join(""), "base64"), data);
});

test("gives each frame the image id the picture on screen does not have, so the old picture stays until the new one is placed", () => {
  assert.deepEqual([0, 1, 2].map(nextImage), [1, 2, 1]);
  assert.equal(kittyDelete(2), "\x1b_Ga=d,d=I,i=2,q=2\x1b\\");
});

test("clears every image without a reply", () => {
  assert.equal(kittyClear(), "\x1b_Ga=d,d=A,q=2\x1b\\");
});

test("turns a point on the grid into a place on the picture, margins excluded", () => {
  const fit = { ...boxed(4, 2, 40, 40), picture: { x: 10, y: 20, width: 500, height: 1000 } };
  const left = 4 * 14 + 10, top = 2 * 29 + 20;
  assert.deepEqual(locate({ x: left, y: top }, fit, GRID), { x: 0, y: 0, inside: true });
  assert.deepEqual(locate({ x: left + 250, y: top + 500 }, fit, GRID), { x: 0.5, y: 0.5, inside: true });
  assert.deepEqual(locate({ x: left - 5, y: top - 5 }, fit, GRID), { x: 0, y: 0, inside: false });
  assert.deepEqual(locate({ x: 5000, y: 5000 }, fit, GRID), { x: 1, y: 1, inside: false });
});

test("reads cell reports at the cell's centre and asks for pixels on the first press", () => {
  const first = resolvePointer(initialPointer(), { x: 20, y: 10, action: "press" }, GRID);
  assert.deepEqual(first.point, { x: 19.5 * 14, y: 9.5 * 29 });
  assert.equal(first.requestPixels, true);
  const again = resolvePointer(first.state, { x: 20, y: 10, action: "release" }, GRID);
  assert.deepEqual(again.point, { x: 19.5 * 14, y: 9.5 * 29 });
  assert.equal(again.requestPixels, false);
});

test("does not ask for pixels before a press", () => {
  const moved = resolvePointer(initialPointer(), { x: 3, y: 3, action: "wheel" }, GRID);
  assert.equal(moved.requestPixels, false);
  assert.equal(moved.state.unit, "cell");
});

test("switches to pixel reports once a report cannot be a cell, in the terminal's own unit", () => {
  const pressed = resolvePointer(initialPointer(), { x: 20, y: 10, action: "press" }, GRID);
  const physical = resolvePointer(pressed.state, { x: 275, y: 277, action: "release" }, GRID);
  assert.deepEqual(physical.state, { unit: "pixel", scale: 1 });
  assert.deepEqual(physical.point, { x: 275, y: 277 });
  const logical = resolvePointer(pressed.state, { x: 137, y: 138, action: "release" }, GRID);
  assert.deepEqual(logical.state, { unit: "pixel", scale: 2 });
  assert.deepEqual(logical.point, { x: 274, y: 276 });
  assert.deepEqual(resolvePointer(logical.state, { x: 10, y: 10, action: "press" }, GRID).point, { x: 20, y: 20 });
});

test("keeps the newest cell as the reference while cell reports continue", () => {
  let step = resolvePointer(initialPointer(), { x: 5, y: 5, action: "press" }, GRID);
  step = resolvePointer(step.state, { x: 30, y: 40, action: "move" }, GRID);
  const pixels = resolvePointer(step.state, { x: 207, y: 573, action: "move" }, GRID);
  assert.deepEqual(pixels.state, { unit: "pixel", scale: 2 });
});

test("takes pixel reports as physical when the reference does not settle the unit", () => {
  const pressed = resolvePointer(initialPointer(), { x: 2, y: 2, action: "press" }, GRID);
  const far = resolvePointer(pressed.state, { x: 700, y: 900, action: "move" }, GRID);
  assert.deepEqual(far.state, { unit: "pixel", scale: 1 });
});

test("turns presses, drags and releases on the screen into one touch", () => {
  const fit = boxed(0, 0, 50, 40);
  const at = (x, y) => ({ x: x * 50 * 14, y: y * 40 * 29 });
  let step = trackGesture(null, { action: "press", button: 0 }, at(0.5, 0.5), fit, GRID);
  assert.deepEqual(step.actions, [{ type: "touch", phase: "begin", x: 0.5, y: 0.5 }]);
  step = trackGesture(step.state, { action: "move", button: 0 }, at(0.5, 0.25), fit, GRID);
  assert.deepEqual(step.actions, [{ type: "touch", phase: "move", x: 0.5, y: 0.25 }]);
  step = trackGesture(step.state, { action: "release", button: 0 }, at(0.5, -3), fit, GRID);
  assert.deepEqual(step.actions, [{ type: "touch", phase: "end", x: 0.5, y: 0 }]);
  assert.equal(step.state, null);
});

test("ignores a gesture that starts off the screen, other buttons, and stray moves", () => {
  const fit = boxed(10, 0, 20, 40);
  let step = trackGesture(null, { action: "press", button: 0 }, { x: 0, y: 0 }, fit, GRID);
  assert.deepEqual(step, { state: null, actions: [] });
  step = trackGesture(null, { action: "move", button: 0 }, { x: 300, y: 300 }, fit, GRID);
  assert.deepEqual(step, { state: null, actions: [] });
  step = trackGesture(null, { action: "press", button: 2 }, { x: 300, y: 300 }, fit, GRID);
  assert.deepEqual(step, { state: null, actions: [] });
  step = trackGesture(null, { action: "release", button: 0 }, { x: 300, y: 300 }, fit, GRID);
  assert.deepEqual(step, { state: null, actions: [] });
});

test("turns the wheel into a scroll anchored under the pointer", () => {
  const fit = boxed(0, 0, 50, 40);
  const point = { x: 350, y: 580 };
  assert.deepEqual(trackGesture(null, { action: "wheel", wheel: { dx: 0, dy: -1 } }, point, fit, GRID).actions, [{ type: "scroll", dx: 0, dy: -1, x: 0.5, y: 0.5 }]);
  assert.deepEqual(trackGesture(null, { action: "wheel", wheel: { dx: 0, dy: 1 } }, { x: 9000, y: 0 }, fit, GRID).actions, []);
});

test("ends a touch that is still down when the screen goes away", () => {
  const fit = boxed(0, 0, 50, 40);
  const down = trackGesture(null, { action: "press", button: 0 }, { x: 350, y: 580 }, fit, GRID);
  assert.deepEqual(trackGesture(down.state, { action: "cancel" }, null, fit, GRID), { state: null, actions: [{ type: "touch", phase: "end", x: 0.5, y: 0.5 }] });
  assert.deepEqual(trackGesture(null, { action: "cancel" }, null, fit, GRID), { state: null, actions: [] });
});

test("maps a point on a display shown turned clockwise back onto the unturned screen", () => {
  const near = (place) => [Number(place.x.toFixed(6)), Number(place.y.toFixed(6))];
  assert.deepEqual(near(unturn(0, 0.2, 0.7)), [0.2, 0.7]);
  assert.deepEqual(near(unturn(1, 0.2, 0.7)), [0.7, 0.8]);
  assert.deepEqual(near(unturn(2, 0.2, 0.7)), [0.8, 0.3]);
  assert.deepEqual(near(unturn(3, 0.2, 0.7)), [0.3, 0.2]);
  assert.deepEqual(near(unturn(5, 0.2, 0.7)), [0.7, 0.8]);
});

test("encodes status text as UTF-8, so an ellipsis does not come out as its low byte", () => {
  assert.deepEqual([...statusBytes("\x1b[2J", "Starting…")], [0x1b, 0x5b, 0x32, 0x4a, ...Buffer.from("Starting"), 0xe2, 0x80, 0xa6]);
  assert.equal(statusBytes("", "起動中").toString("utf8"), "起動中");
});
