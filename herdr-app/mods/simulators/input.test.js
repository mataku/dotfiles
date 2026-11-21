import assert from "node:assert/strict";
import { test } from "node:test";

import { createInputParser } from "./viewer/input.js";

const parse = (...chunks) => {
  const parser = createInputParser();
  return [...chunks.flatMap((chunk) => parser.push(Buffer.from(chunk, "latin1"))), ...parser.flush()];
};

test("reads a click as a press and a release with its position", () => {
  assert.deepEqual(parse("\x1b[<0;300;500M\x1b[<0;300;500m"), [
    { type: "mouse", action: "press", button: 0, x: 300, y: 500 },
    { type: "mouse", action: "release", button: 0, x: 300, y: 500 },
  ]);
});

test("reads drags, other buttons and modifiers", () => {
  assert.deepEqual(parse("\x1b[<32;10;20M\x1b[<2;1;1M\x1b[<36;10;21M\x1b[<35;4;4M"), [
    { type: "mouse", action: "move", button: 0, x: 10, y: 20 },
    { type: "mouse", action: "press", button: 2, x: 1, y: 1 },
    { type: "mouse", action: "move", button: 0, x: 10, y: 21 },
    { type: "mouse", action: "move", button: 3, x: 4, y: 4 },
  ]);
});

test("reads the wheel as a direction", () => {
  assert.deepEqual(parse("\x1b[<64;5;6M\x1b[<65;5;6M\x1b[<66;5;6M\x1b[<67;5;6M").map((event) => [event.action, event.wheel]), [
    ["wheel", { dx: 0, dy: -1 }],
    ["wheel", { dx: 0, dy: 1 }],
    ["wheel", { dx: -1, dy: 0 }],
    ["wheel", { dx: 1, dy: 0 }],
  ]);
});

test("reads the terminal's size reports and graphics replies", () => {
  assert.deepEqual(parse("\x1b[48;46;53;1334;742t\x1b_Gi=1,p=1;OK\x1b\\\x1b_Gi=1;EINVAL: bad\x1b\\"), [
    { type: "resize", rows: 46, cols: 53, height: 1334, width: 742 },
    { type: "graphics", ok: true, message: "OK" },
    { type: "graphics", ok: false, message: "EINVAL: bad" },
  ]);
});

test("reads typed text, including text that is not ASCII", () => {
  assert.deepEqual(parse("hi"), [{ type: "text", text: "hi" }]);
  assert.deepEqual(parse(Buffer.from("é日本", "utf8").toString("latin1")), [{ type: "text", text: "é日本" }]);
});

test("reads named keys and control chords", () => {
  assert.deepEqual(parse("\r\x7f\t\x1b[A\x1b[B\x1b[C\x1b[D\x1b[H\x1b[F\x1b[3~\x1b[5~\x1b[6~\x03").map((event) => event.key + (event.ctrl ? "+ctrl" : "")), [
    "enter", "backspace", "tab", "up", "down", "right", "left", "home", "end", "delete", "pageup", "pagedown", "c+ctrl",
  ]);
  assert.deepEqual(parse("\x1bOA\x1b[1;5C"), [{ type: "key", key: "up" }, { type: "key", key: "right" }]);
});

test("reads a lone escape as the Escape key, and one before a sequence as part of it", () => {
  assert.deepEqual(parse("\x1b"), [{ type: "key", key: "escape" }]);
  assert.deepEqual(parse("\x1b", "[A"), [{ type: "key", key: "up" }]);
  assert.deepEqual(parse("\x1b", "x"), [{ type: "key", key: "escape" }, { type: "text", text: "x" }]);
});

test("joins sequences and characters split across reads", () => {
  assert.deepEqual(parse("\x1b[<0;30", "0;500M"), [{ type: "mouse", action: "press", button: 0, x: 300, y: 500 }]);
  assert.deepEqual(parse("\x1b_Gi=1;O", "K\x1b", "\\a"), [{ type: "graphics", ok: true, message: "OK" }, { type: "text", text: "a" }]);
  const [first, second] = [Buffer.from("日", "utf8").subarray(0, 2), Buffer.from("日", "utf8").subarray(2)];
  assert.deepEqual(parse(first.toString("latin1"), second.toString("latin1")), [{ type: "text", text: "日" }]);
});

test("skips sequences it does not know without losing what follows", () => {
  assert.deepEqual(parse("\x1b[?62;22c\x1b[200~a\x1b]0;a title\x07b\x1b[<0;1;1;9Mc"), [
    { type: "text", text: "a" },
    { type: "text", text: "b" },
    { type: "text", text: "c" },
  ]);
});

test("gives up on a sequence that never ends rather than holding input forever", () => {
  const parser = createInputParser();
  assert.deepEqual(parser.push(Buffer.from(`\x1b_G${"x".repeat(5000)}`, "latin1")), []);
  assert.deepEqual(parser.push(Buffer.from("ok", "latin1")), [{ type: "text", text: "ok" }]);
});

test("reads the terminal's background color from its answer", () => {
  assert.deepEqual(parse("\x1b]11;rgb:2828/3131/3737\x07"), [{ type: "background", color: [0x28, 0x31, 0x37] }]);
  assert.deepEqual(parse("\x1b]11;rgb:28/31/37\x1b\\"), [{ type: "background", color: [0x28, 0x31, 0x37] }]);
  assert.deepEqual(parse("\x1b]11;rgb:zz/31/37\x07\x1b]10;rgb:ffff/ffff/ffff\x07"), []);
});
