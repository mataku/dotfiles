import { View, div, image } from "gpui-kit";
import { Input, InputState, ScrollHandle, TextView, h_flex, v_flex } from "gpui-base";
import { appHome, checking, closeOverlay, exec, focused, home, props, readTextFile, run, spaces, theme, watchFolder } from "herdr";

export const fileOf = (given) => (typeof given?.file === "string" && given.file.startsWith("/") ? given.file : null);

export const labelOf = (file, homeFolder) => (file.startsWith(`${homeFolder}/`) ? `~${file.slice(homeFolder.length)}` : file);

export const folderOf = (file) => file.slice(0, file.lastIndexOf("/")) || "/";

// Why the folder counts: a batch that overflowed names only the watched root, and it means anything under it may have changed.
export const isChanged = (paths, file, images = []) => paths.includes(file) || paths.includes(folderOf(file)) || images.some((image) => paths.includes(image));

const IMAGE_LINE = /^ {0,3}!\[([^\]]*)\]\((.+)\)\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const WEB = /^https?:\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PICTURE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

function normalize(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function destinationOf(inside) {
  const given = inside.trim();
  if (given.startsWith("<") && given.includes(">")) return given.slice(1, given.indexOf(">"));
  return given.split(/\s/)[0];
}

function pictureOf(line, file) {
  const [, alt, inside] = line.match(IMAGE_LINE) ?? [];
  if (inside === undefined) return null;
  const destination = destinationOf(inside);
  if (WEB.test(destination)) return { link: `[${alt || destination}](${destination})` };
  if (SCHEME.test(destination) || !PICTURE.test(destination)) return null;
  const path = decode(destination);
  return { path: normalize(path.startsWith("/") ? path : `${folderOf(file)}/${path}`), alt };
}

// Why the text is cut here: the text view draws nothing for an image, so each local image that stands on its own line is drawn as an element between two pieces of text.
export function segmentsOf(markdown, file) {
  const segments = [];
  let lines = [];
  let fence = null;
  const flush = () => {
    const text = lines.join("\n");
    if (text.trim() !== "") segments.push({ type: "text", text });
    lines = [];
  };
  for (const line of markdown.split("\n")) {
    const mark = line.match(FENCE)?.[1][0] ?? null;
    if (mark !== null && (fence === null || fence === mark)) fence = fence === null ? mark : null;
    const picture = fence === null && mark === null ? pictureOf(line, file) : null;
    if (picture?.path) {
      flush();
      segments.push({ type: "image", path: picture.path, alt: picture.alt });
    } else {
      lines.push(picture?.link ?? line);
    }
  }
  flush();
  return segments;
}

const CACHE = "mods/markdown-preview/.images";
const STAT = "/usr/bin/stat";
const REGULAR_FILE = /^Regular File (\d+)\s*$/;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 50;

function hashOf(text) {
  let hash = 5381;
  for (const char of text) hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

// Why the pane is in the name: two panes can show the same image, and each removes its own copies when it closes.
export const cacheNameOf = (path, owner) => `${owner}-${hashOf(path)}.${path.match(PICTURE)[1].toLowerCase()}`;

export function isCopyable(described, maxBytes) {
  const size = described.match(REGULAR_FILE)?.[1];
  return size !== undefined && Number(size) <= maxBytes;
}

export function limitImages(segments, max) {
  const drawn = new Set();
  return segments.map((segment) => {
    if (segment.type !== "image" || drawn.has(segment.path)) return segment;
    if (drawn.size < max) {
      drawn.add(segment.path);
      return segment;
    }
    return { ...segment, type: "skipped" };
  });
}

export function copiesToMake(paths, cached, changed, folder) {
  const isUnclear = changed.includes(folder);
  return paths.filter((path) => isUnclear || !cached.has(path) || changed.includes(path));
}

// Why the file is described first: a document can name anything, and a link to a device or a huge file would be copied until the command timed out.
async function copyImage(path, target) {
  const described = await exec(STAT, ["-L", "-f", "%HT %z", path]);
  if (described.code !== 0 || !isCopyable(described.stdout, MAX_IMAGE_BYTES)) return false;
  const copied = await exec("cp", ["-f", path, target]);
  return copied.code === 0;
}

const MARKDOWN = /\.(md|markdown)$/i;
const MAX_ROWS = 200;
const LIST_TIMEOUT_MS = 10000;
const GIT_READ = ["--no-optional-locks", "-c", "core.fsmonitor=false"];
const LIST_HEIGHT = 320;

export const roleOf = (given) => (typeof given?.overlay === "string" && fileOf(given) === null ? "picker" : "preview");

const depthOf = (path) => path.split("/").length;

export function parseFiles(printed) {
  const files = printed.split("\n").map((line) => line.trim().replace(/^\.\//, "")).filter((line) => MARKDOWN.test(line));
  return [...new Set(files)].sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : a > b ? 1 : 0));
}

export function filterFiles(files, typed) {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return files.filter((file) => words.every((word) => file.toLowerCase().includes(word)));
}

export const stepCursor = (at, by, count) => (count === 0 ? 0 : (Math.min(at, count - 1) + by + count) % count);

// Why only git: its list comes from the index, so nothing walks the disk, and ignored folders stay out. Outside a repository there is no list.
// Why git is told to ignore fsmonitor: that setting names a program to run, and it comes from the repository being listed.
async function listMarkdown(where) {
  const top = await exec("git", [...GIT_READ, "rev-parse", "--show-toplevel"], { cwd: where }).catch(() => null);
  if (top?.code !== 0) return { root: null, files: [] };
  const root = top.stdout.trim();
  const listed = await exec("git", [...GIT_READ, "ls-files", "-co", "--exclude-standard", "--", "*.md", "*.markdown"], { cwd: root, timeout: LIST_TIMEOUT_MS });
  return { root, files: parseFiles(listed.stdout) };
}

export default class MarkdownPreview extends View {
  init(_props, cx) {
    this.role = roleOf(props());
    if (this.role === "picker") return this.initPicker(cx);
    this.file = fileOf(props());
    this.text = null;
    this.error = null;
    this.watch = null;
    this.segments = [];
    this.shown = new Map();
    this.owner = Math.random().toString(16).slice(2, 10);
    this.loads = 0;
    if (checking() || !this.file) return;
    this.load([], cx);
    cx.spawn(async (cx) => {
      try {
        for (;;) {
          this.watch = watchFolder(folderOf(this.file));
          const paths = await this.watch;
          if (isChanged(paths, this.file, [...this.shown.keys()])) this.load(paths, cx);
        }
      } catch {}
    });
  }

  initPicker(cx) {
    this.root = null;
    this.files = [];
    this.listed = false;
    this.failure = null;
    this.at = 0;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Open a Markdown file…" });
    this.input.on("change", (_event, cx) => {
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", () => this.choose(this.matches()[this.at]));
    this.input.focus();
    if (checking()) return;
    // Why the folder is read first: opening the dialog can move the focus, and the list must come from the terminal the person was in.
    const where = focused()?.cwd || spaces().find((space) => space.active)?.folder || home();
    cx.spawn(async (cx) => {
      try {
        const { root, files } = await listMarkdown(where);
        this.root = root;
        this.files = files;
      } catch (failure) {
        this.failure = String(failure?.message ?? failure);
      }
      this.listed = true;
      cx.notify();
    });
  }

  matches() {
    return filterFiles(this.files, this.input.value()).slice(0, MAX_ROWS);
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  choose(file) {
    if (!file || !this.root) return;
    this.dismiss();
    run("pane.split", { direction: "right", mod: "markdown-preview", props: { file: `${this.root}/${file}` } });
  }

  move(by, cx) {
    this.at = stepCursor(this.at, by, this.matches().length);
    this.scroll.scroll_to_item(this.at);
    cx.notify();
  }

  renderPicker(t) {
    const rows = this.matches();
    const note = (text, color) => div().px(10).py(8).text_color(color).child(text);
    const list = this.failure
      ? [note(this.failure, t.blocked)]
      : !this.listed
        ? [note("Looking for Markdown files…", t.dim)]
        : rows.length === 0
          ? [note(this.root === null ? "Not inside a git repository" : this.files.length === 0 ? "No Markdown files in this repository" : "No file matches", t.dim)]
          : rows.map((file, index) =>
            div().id(`markdown-preview-file-${index}`).px(10).py(5).flex_none().rounded(6).truncate()
              .bg(index === this.at ? t.selected : t.popover).text_color(index === this.at ? t.foreground : t.muted)
              .hover((style) => style.bg(t.hover))
              .on_click(() => this.choose(file))
              .child(file));
    return v_flex().id("markdown-preview-picker").track_focus(this.handle).w_full().min_h(0).p(14).gap(10).bg(t.popover).text_size(13)
      .on_key_down((event, cx) => {
        if (event.key === "escape") this.dismiss();
        else if (event.key === "down") this.move(1, cx);
        else if (event.key === "up") this.move(-1, cx);
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().h(34).px(10).flex_none().items_center().rounded(8).border(1).border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .when(Boolean(this.root), (el) => el.child(div().px(2).flex_none().text_size(11.5).text_color(t.dim).truncate().child(labelOf(this.root, home()))))
      .child(v_flex().id("markdown-preview-files").h(LIST_HEIGHT).flex_none().gap(1).overflow_y_scrollbar().track_scroll(this.scroll).children(list));
  }

  async close() {
    if (this.role === "picker") return;
    this.watch?.cancel();
    const copies = [...this.shown.values()].map((path) => `${appHome()}/${path}`);
    if (copies.length > 0) await exec("rm", ["-f", ...copies]);
  }

  async cacheImages(paths, changed) {
    const shown = new Map([...this.shown].filter(([path]) => paths.includes(path)));
    const dropped = [...this.shown].filter(([path]) => !paths.includes(path)).map(([, copy]) => `${appHome()}/${copy}`);
    const folder = `${appHome()}/${CACHE}`;
    if (paths.length > 0) await exec("mkdir", ["-p", folder]);
    for (const path of copiesToMake(paths, shown, changed, folderOf(this.file))) {
      const name = cacheNameOf(path, this.owner);
      const isCopied = await copyImage(path, `${folder}/${name}`).catch(() => false);
      if (isCopied) {
        shown.set(path, `${CACHE}/${name}`);
      } else if (shown.delete(path)) {
        dropped.push(`${folder}/${name}`);
      }
    }
    if (dropped.length > 0) await exec("rm", ["-f", ...dropped]).catch(() => null);
    return shown;
  }

  load(changed, cx) {
    const turn = ++this.loads;
    cx.spawn(async (cx) => {
      let text = null;
      let error = null;
      try {
        text = await readTextFile(this.file);
        if (text === null) error = "The file is not there.";
      } catch (failure) {
        error = String(failure?.message ?? failure);
      }
      // Why the turn is checked: saves can come faster than a load finishes, and an older load must not replace a newer one.
      if (turn !== this.loads) return;
      if (text !== null) {
        const segments = limitImages(segmentsOf(text, this.file), MAX_IMAGES);
        const pictures = [...new Set(segments.filter((segment) => segment.type === "image").map((segment) => segment.path))];
        const shown = await this.cacheImages(pictures, changed).catch(() => new Map());
        if (turn !== this.loads) return;
        this.shown = shown;
        this.segments = segments;
        this.text = text;
      }
      this.error = error;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    if (this.role === "picker") return this.renderPicker(t);
    const root = v_flex().size_full().bg(t.background).text_size(13).text_color(t.foreground);
    if (!this.file) return root.child(div().p(14).text_color(t.dim).child("No Markdown file to show. Open this mod with props { file: \"/absolute/path.md\" }."));
    const body = this.text === null
      ? div().p(14).text_color(this.error ? t.blocked : t.dim).child(this.error ?? "Loading…")
      : v_flex().id("markdown-preview-scroll").size_full().gap(8).overflow_y_scrollbar()
        .children(this.segments.map((segment, index) =>
          segment.type !== "text"
            ? this.shown.has(segment.path)
              ? image(this.shown.get(segment.path)).max_w_full().flex_none()
              : div().flex_none().text_color(t.dim).child(`${segment.type === "skipped" ? "Too many images to show" : "Image not shown"}: ${segment.alt || segment.path}`)
            : TextView.markdown(`markdown-preview-${index}`, segment.text).selectable()));
    return root
      .child(h_flex().h(30).px(12).gap(8).flex_none().items_center().border_b(1).border_color(t.border).text_size(11.5).text_color(t.muted)
        .child(div().flex_1().min_w(0).truncate().child(labelOf(this.file, home())))
        .when(this.text !== null && this.error !== null, (el) => el.child(div().flex_none().text_color(t.blocked).child(this.error))))
      .child(div().id("markdown-preview-body").flex_1().min_h(0).px(18).py(12).child(body));
  }
}
