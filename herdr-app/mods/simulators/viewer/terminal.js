import fs from "node:fs";
import tty from "node:tty";

import { createInputParser } from "./input.js";
import { kittyClear, statusBytes } from "./screen.js";

const ALTERNATE_SCREEN = 1049;
const CURSOR = 25;
const SIZE_REPORTS = 2048;
const MOUSE_DRAG = 1002;
const MOUSE_SGR = 1006;
const MOUSE_PIXELS = 1016;

const set = (mode) => `\x1b[?${mode}h`;
const reset = (mode) => `\x1b[?${mode}l`;
const CLEAR = "\x1b[2J\x1b[H";
const BACKGROUND_QUERY = "\x1b]11;?\x07";
const ENTER = [set(ALTERNATE_SCREEN), reset(CURSOR), CLEAR, kittyClear(), set(MOUSE_DRAG), set(MOUSE_SGR), set(SIZE_REPORTS), BACKGROUND_QUERY].join("");
const LEAVE = [kittyClear(), reset(MOUSE_PIXELS), reset(MOUSE_SGR), reset(MOUSE_DRAG), reset(SIZE_REPORTS), CLEAR, set(CURSOR), reset(ALTERNATE_SCREEN)].join("");
const LONE_ESCAPE_WAIT_MS = 30;

function writeAll(fd, data) {
  return new Promise((resolve, reject) => {
    const step = (offset) => {
      fs.write(fd, data, offset, data.length - offset, null, (error, written) => {
        if (error) reject(error);
        else if (offset + written < data.length) step(offset + written);
        else resolve();
      });
    };
    step(0);
  });
}

export function openTerminal(path, onEvent) {
  const noControl = fs.constants.O_NOCTTY;
  const input = new tty.ReadStream(fs.openSync(path, fs.constants.O_RDONLY | noControl));
  const outputFd = fs.openSync(path, fs.constants.O_WRONLY | noControl);
  const parser = createInputParser();
  let escapeTimer = null;
  let queue = Promise.resolve();
  let open = true;

  input.setRawMode(true);
  input.on("data", (chunk) => {
    clearTimeout(escapeTimer);
    parser.push(chunk).forEach(onEvent);
    escapeTimer = setTimeout(() => parser.flush().forEach(onEvent), LONE_ESCAPE_WAIT_MS);
  });
  input.on("error", () => onEvent({ type: "closed" }));
  input.on("end", () => onEvent({ type: "closed" }));

  // Why a queue: two writes in flight could interleave a frame's chunks with another sequence.
  // Why it never rejects: callers draw from many places, and a terminal that went away is one event for all of them.
  function write(data) {
    const bytes = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    queue = queue
      .then(() => (open ? writeAll(outputFd, bytes) : undefined))
      .catch(() => onEvent({ type: "closed" }));
    return queue;
  }

  const clearText = () => write(CLEAR);
  const showStatus = (text) => write(statusBytes(CLEAR, text));

  // Why synchronous: it also runs from signal handlers, right before the process exits.
  function close() {
    if (!open) return;
    open = false;
    clearTimeout(escapeTimer);
    try {
      fs.writeSync(outputFd, LEAVE);
    } catch {
      // The terminal is gone; there is nothing left to restore.
    }
    try {
      input.setRawMode(false);
    } catch {
      // Same: a terminal that ended cannot be put back in cooked mode.
    }
    input.destroy();
    fs.closeSync(outputFd);
  }

  write(ENTER);
  return { write, clearText, showStatus, requestPixelReports: () => write(set(MOUSE_PIXELS)), close };
}
