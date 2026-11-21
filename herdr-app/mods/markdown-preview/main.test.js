import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

const HOST_MODULES = {
  "gpui-kit": ["View", "div", "image"],
  "gpui-base": ["h_flex", "v_flex", "TextView", "InputState", "Input", "ScrollHandle"],
  herdr: ["appHome", "checking", "closeOverlay", "exec", "focused", "home", "props", "readTextFile", "run", "spaces", "theme", "watchFolder"],
};
const stubOf = (names) => `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name} = class {};`).join(""))}`;
const stubs = Object.fromEntries(Object.entries(HOST_MODULES).map(([name, names]) => [name, stubOf(names)]));
register(`data:text/javascript,${encodeURIComponent(
  `const stubs = ${JSON.stringify(stubs)};
   export const resolve = (specifier, context, next) =>
     stubs[specifier] ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context);`,
)}`);

const { cacheNameOf, copiesToMake, fileOf, filterFiles, folderOf, isChanged, isCopyable, labelOf, limitImages, parseFiles, roleOf, segmentsOf, stepCursor } = await import("./main.js");

test("takes an absolute path as the file to show", () => {
  assert.equal(fileOf({ file: "/Users/me/notes/README.md" }), "/Users/me/notes/README.md");
});

test("refuses a missing, relative or non-text file prop", () => {
  assert.equal(fileOf(undefined), null);
  assert.equal(fileOf({}), null);
  assert.equal(fileOf({ file: "README.md" }), null);
  assert.equal(fileOf({ file: 7 }), null);
});

test("shortens the home folder in the label", () => {
  assert.equal(labelOf("/Users/me/notes/README.md", "/Users/me"), "~/notes/README.md");
  assert.equal(labelOf("/etc/hosts.md", "/Users/me"), "/etc/hosts.md");
  assert.equal(labelOf("/Users/meow/a.md", "/Users/me"), "/Users/meow/a.md");
});

test("names the folder a file is in", () => {
  assert.equal(folderOf("/Users/me/notes/README.md"), "/Users/me/notes");
  assert.equal(folderOf("/README.md"), "/");
});

test("reloads when a change touches the shown file or cannot be told apart", () => {
  const file = "/Users/me/notes/README.md";
  assert.equal(isChanged([file], file), true);
  assert.equal(isChanged(["/Users/me/notes/other.md"], file), false);
  assert.equal(isChanged(["/Users/me/notes"], file), true);
  assert.equal(isChanged([], file), false);
});

test("reloads when a change touches an image the file shows", () => {
  const file = "/Users/me/notes/README.md";
  assert.equal(isChanged(["/Users/me/notes/misc/a.png"], file, ["/Users/me/notes/misc/a.png"]), true);
  assert.equal(isChanged(["/Users/me/notes/misc/b.png"], file, ["/Users/me/notes/misc/a.png"]), false);
});

const FROM = "/Users/me/notes/README.md";
const text = (value) => ({ type: "text", text: value });
const picture = (path, alt = "") => ({ type: "image", path, alt });

test("keeps a document without images as one piece of text", () => {
  assert.deepEqual(segmentsOf("# Title\n\nBody.\n", FROM), [text("# Title\n\nBody.\n")]);
});

test("cuts the text at an image that stands on its own line", () => {
  const source = "Before.\n\n![shot](./misc/screenshot.png)\n\nAfter.\n";
  assert.deepEqual(segmentsOf(source, FROM), [text("Before.\n"), picture("/Users/me/notes/misc/screenshot.png", "shot"), text("\nAfter.\n")]);
});

test("resolves an image path against the file's folder", () => {
  const pathOf = (target) => segmentsOf(`![](${target})`, FROM)[0].path;
  assert.equal(pathOf("misc/a.png"), "/Users/me/notes/misc/a.png");
  assert.equal(pathOf("../shared/b.jpg"), "/Users/me/shared/b.jpg");
  assert.equal(pathOf("/var/images/c.gif"), "/var/images/c.gif");
  assert.equal(pathOf("misc/my%20shot.png"), "/Users/me/notes/misc/my shot.png");
  assert.equal(pathOf('misc/a.png "A title"'), "/Users/me/notes/misc/a.png");
  assert.equal(pathOf("<misc/with space.png>"), "/Users/me/notes/misc/with space.png");
});

test("shows images that follow each other one by one", () => {
  assert.deepEqual(segmentsOf("![](a.png)\n![](b.png)\n", FROM), [picture("/Users/me/notes/a.png"), picture("/Users/me/notes/b.png")]);
});

test("turns an image on the web into a link to it", () => {
  assert.deepEqual(segmentsOf("![logo](https://example.com/logo.png)\n", FROM), [text("[logo](https://example.com/logo.png)\n")]);
  assert.deepEqual(segmentsOf("![](https://example.com/logo.png)\n", FROM), [text("[https://example.com/logo.png](https://example.com/logo.png)\n")]);
});

test("leaves an image inside a sentence to the text", () => {
  const source = "See ![icon](icon.png) here.\n";
  assert.deepEqual(segmentsOf(source, FROM), [text(source)]);
});

test("leaves an image line inside a code block alone", () => {
  const source = "```md\n![shot](a.png)\n```\n";
  assert.deepEqual(segmentsOf(source, FROM), [text(source)]);
  const tildes = "~~~\n![shot](a.png)\n~~~\n\n![shot](a.png)\n";
  assert.deepEqual(segmentsOf(tildes, FROM), [text("~~~\n![shot](a.png)\n~~~\n"), picture("/Users/me/notes/a.png", "shot")]);
});

test("leaves a line that names something other than a picture to the text", () => {
  const source = "![notes](notes.txt)\n";
  assert.deepEqual(segmentsOf(source, FROM), [text(source)]);
});

test("names a cached image after its pane and its path, keeping the kind of picture", () => {
  const name = cacheNameOf("/Users/me/notes/misc/My Shot.PNG", "a1b2c3d4");
  assert.match(name, /^a1b2c3d4-[0-9a-f]{8}\.png$/);
  assert.equal(cacheNameOf("/Users/me/notes/misc/My Shot.PNG", "a1b2c3d4"), name);
});

test("gives images at different paths or in different panes different cached names", () => {
  assert.notEqual(cacheNameOf("/Users/me/a/shot.png", "p1"), cacheNameOf("/Users/me/b/shot.png", "p1"));
  assert.notEqual(cacheNameOf("/Users/me/a/shot.png", "p1"), cacheNameOf("/Users/me/a/shot.png", "p2"));
});

test("copies only a regular file that is not too large", () => {
  const limit = 1000;
  assert.equal(isCopyable("Regular File 8\n", limit), true);
  assert.equal(isCopyable("Regular File 1000\n", limit), true);
  assert.equal(isCopyable("Regular File 1001\n", limit), false);
  assert.equal(isCopyable("Character Device 0\n", limit), false);
  assert.equal(isCopyable("Directory 416\n", limit), false);
  assert.equal(isCopyable("Fifo File 0\n", limit), false);
  assert.equal(isCopyable("", limit), false);
  assert.equal(isCopyable("Regular File many\n", limit), false);
});

test("stops drawing images past the limit and says so in their place", () => {
  const segments = [picture("/a.png"), text("t"), picture("/b.png"), picture("/c.png")];
  assert.deepEqual(limitImages(segments, 2), [picture("/a.png"), text("t"), picture("/b.png"), { type: "skipped", path: "/c.png", alt: "" }]);
  assert.deepEqual(limitImages(segments, 5), segments);
});

test("counts an image shown twice once against the limit", () => {
  const segments = [picture("/a.png"), picture("/a.png"), picture("/b.png")];
  assert.deepEqual(limitImages(segments, 2), segments);
});

test("copies the images that are new or that changed, and no others", () => {
  const cached = new Map([["/n/a.png", "x-a.png"], ["/n/b.png", "x-b.png"]]);
  assert.deepEqual(copiesToMake(["/n/a.png", "/n/b.png", "/n/c.png"], cached, ["/n/b.png", "/n/other.md"], "/n"), ["/n/b.png", "/n/c.png"]);
  assert.deepEqual(copiesToMake(["/n/a.png", "/n/b.png"], cached, [], "/n"), []);
});

test("copies every image again when the change cannot be told apart", () => {
  const cached = new Map([["/n/a.png", "x-a.png"]]);
  assert.deepEqual(copiesToMake(["/n/a.png"], cached, ["/n"], "/n"), ["/n/a.png"]);
});

test("shows a file when given one and offers a choice otherwise", () => {
  assert.equal(roleOf({ file: "/Users/me/notes/README.md" }), "preview");
  assert.equal(roleOf({ overlay: "o1" }), "picker");
  assert.equal(roleOf({ overlay: "o1", file: "/Users/me/notes/README.md" }), "preview");
  assert.equal(roleOf(undefined), "preview");
});

test("lists the markdown files a command printed, shallowest first", () => {
  const printed = "docs/guide/setup.md\n./README.md\ndocs/intro.markdown\n\nsrc/main.js\nCHANGELOG.md\n";
  assert.deepEqual(parseFiles(printed), ["CHANGELOG.md", "README.md", "docs/intro.markdown", "docs/guide/setup.md"]);
});

test("lists a file once even when it was printed twice", () => {
  assert.deepEqual(parseFiles("README.md\n./README.md\n"), ["README.md"]);
});

test("narrows the list to files that contain every typed word", () => {
  const files = ["README.md", "docs/intro.md", "docs/guide/setup.md", "herdr-app/README.md"];
  assert.deepEqual(filterFiles(files, ""), files);
  assert.deepEqual(filterFiles(files, "readme"), ["README.md", "herdr-app/README.md"]);
  assert.deepEqual(filterFiles(files, "docs setup"), ["docs/guide/setup.md"]);
  assert.deepEqual(filterFiles(files, "  HERDR  "), ["herdr-app/README.md"]);
  assert.deepEqual(filterFiles(files, "nothing"), []);
});

test("moves the cursor through the list and wraps at both ends", () => {
  assert.equal(stepCursor(0, 1, 3), 1);
  assert.equal(stepCursor(2, 1, 3), 0);
  assert.equal(stepCursor(0, -1, 3), 2);
  assert.equal(stepCursor(5, 1, 3), 0);
  assert.equal(stepCursor(0, 1, 0), 0);
});
