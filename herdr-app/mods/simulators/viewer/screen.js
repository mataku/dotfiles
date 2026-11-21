const IMAGE_IDS = [1, 2];
const PLACEMENT_ID = 1;
const CHUNK_LENGTH = 4096;
const PIXEL_SCALES = [1, 2];
const SCALE_TOLERANCE_CELLS = 3;
const PRIMARY_BUTTON = 0;
const WHOLE_FRACTIONS = [1, 1 / 2, 1 / 3, 1 / 4];
const WHOLE_FRACTION_REACH = 0.06;

const positive = (value) => Number.isFinite(value) && value > 0;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Why prefer a whole fraction of the device's pixels: the picture is then an exact reduction (every pixel the mean of a whole block), which is sharper than an odd ratio and much cheaper to decode.
// Why never above 1: enlarging adds no detail, only blur.
export function fitScreen(grid, device) {
  if (![grid.cols, grid.rows, grid.cellWidth, grid.cellHeight, device.width, device.height].every(positive)) return null;
  const largest = Math.min((grid.cols * grid.cellWidth) / device.width, (grid.rows * grid.cellHeight) / device.height, 1);
  const scale = WHOLE_FRACTIONS.find((fraction) => fraction <= largest && fraction >= largest * (1 - WHOLE_FRACTION_REACH)) ?? largest;
  const picture = { width: Math.max(1, Math.round(device.width * scale)), height: Math.max(1, Math.round(device.height * scale)) };
  const cols = Math.min(grid.cols, Math.ceil(picture.width / grid.cellWidth));
  const rows = Math.min(grid.rows, Math.ceil(picture.height / grid.cellHeight));
  const width = Math.round(cols * grid.cellWidth);
  const height = Math.round(rows * grid.cellHeight);
  return {
    col: Math.floor((grid.cols - cols) / 2),
    row: Math.floor((grid.rows - rows) / 2),
    cols,
    rows,
    width,
    height,
    picture: { x: Math.floor((width - picture.width) / 2), y: Math.floor((height - picture.height) / 2), ...picture },
  };
}

// Why not one image id for every frame: the terminal drops the picture on screen the moment a new transfer for its id begins, and shows nothing until that transfer ends.
export const nextImage = (shown) => (shown === IMAGE_IDS[0] ? IMAGE_IDS[1] : IMAGE_IDS[0]);

// Why the image is exactly as large as its cells: a terminal that has to resize an image to its cell box blurs it.
export function kittyFrame({ image, fit, data }) {
  const encoded = data.toString("base64");
  const keys = `a=T,f=24,o=z,i=${image},p=${PLACEMENT_ID},C=1,s=${fit.width},v=${fit.height},c=${fit.cols},r=${fit.rows},`;
  const parts = [`\x1b[${fit.row + 1};${fit.col + 1}H`];
  for (let start = 0; start < encoded.length || start === 0; start += CHUNK_LENGTH) {
    const more = start + CHUNK_LENGTH < encoded.length ? 1 : 0;
    parts.push(`\x1b_G${start === 0 ? keys : ""}m=${more};${encoded.slice(start, start + CHUNK_LENGTH)}\x1b\\`);
  }
  return Buffer.from(parts.join(""), "latin1");
}

export function kittyDelete(image) {
  return `\x1b_Ga=d,d=I,i=${image},q=2\x1b\\`;
}

export function kittyClear() {
  return "\x1b_Ga=d,d=A,q=2\x1b\\";
}

export function locate(point, fit, grid) {
  const x = (point.x - fit.col * grid.cellWidth - fit.picture.x) / fit.picture.width;
  const y = (point.y - fit.row * grid.cellHeight - fit.picture.y) / fit.picture.height;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

export function initialPointer() {
  return { unit: "cell", requested: false, anchor: null };
}

function scaleFor(anchor, report, grid) {
  if (anchor === null) return 1;
  const errorOf = (scale) => Math.max(Math.abs(report.x * scale - anchor.x) / grid.cellWidth, Math.abs(report.y * scale - anchor.y) / grid.cellHeight);
  const best = PIXEL_SCALES.reduce((a, b) => (errorOf(b) < errorOf(a) ? b : a));
  return errorOf(best) <= SCALE_TOLERANCE_CELLS ? best : 1;
}

// Why not ask for pixel reports from the start: a terminal may report them in physical or in logical pixels, and nothing but a position known in cells tells the two apart.
export function resolvePointer(state, report, grid) {
  if (state.unit === "pixel") {
    return { state, point: { x: report.x * state.scale, y: report.y * state.scale }, requestPixels: false };
  }
  const beyondCells = report.x > grid.cols || report.y > grid.rows;
  if (state.requested && beyondCells) {
    const scale = scaleFor(state.anchor, report, grid);
    return { state: { unit: "pixel", scale }, point: { x: report.x * scale, y: report.y * scale }, requestPixels: false };
  }
  const point = { x: (report.x - 0.5) * grid.cellWidth, y: (report.y - 0.5) * grid.cellHeight };
  const requestPixels = !state.requested && report.action === "press";
  const requested = state.requested || requestPixels;
  return { state: { unit: "cell", requested, anchor: requested ? point : null }, point, requestPixels };
}

export function trackGesture(state, event, point, fit, grid) {
  if (event.action === "cancel") {
    return { state: null, actions: state ? [{ type: "touch", phase: "end", x: state.x, y: state.y }] : [] };
  }
  const place = locate(point, fit, grid);
  const touch = (phase) => ({ type: "touch", phase, x: place.x, y: place.y });
  switch (event.action) {
    case "wheel":
      return { state, actions: place.inside ? [{ type: "scroll", dx: event.wheel.dx, dy: event.wheel.dy, x: place.x, y: place.y }] : [] };
    case "press":
      if (event.button !== PRIMARY_BUTTON || !place.inside || state) return { state, actions: [] };
      return { state: { x: place.x, y: place.y }, actions: [touch("begin")] };
    case "move":
      return state ? { state: { x: place.x, y: place.y }, actions: [touch("move")] } : { state, actions: [] };
    case "release":
      return state && event.button === PRIMARY_BUTTON ? { state: null, actions: [touch("end")] } : { state, actions: [] };
    default:
      return { state, actions: [] };
  }
}

export function unturn(quarterTurns, x, y) {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1: return { x: y, y: 1 - x };
    case 2: return { x: 1 - x, y: 1 - y };
    case 3: return { x: 1 - y, y: x };
    default: return { x, y };
  }
}

// Why not the Latin-1 used for control sequences: that keeps only each character's low byte, which turns "…" into "&".
export const statusBytes = (clear, text) => Buffer.from(`${clear}${text}`, "utf8");
