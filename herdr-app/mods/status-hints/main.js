import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, focused, nextCommand, notify } from "herdr";

const JUMP_COMMAND = "jump-attention";
const JUMP_ACTION = `status-hints.${JUMP_COMMAND}`;
const MARKDOWN_MOD = "markdown-preview";
const MARKDOWN_ACTION = `mod.open:${MARKDOWN_MOD}`;
const CONTAINERS_MOD = "containers";
const CONTAINERS_ACTION = `mod.open:${CONTAINERS_MOD}`;
const URGENCY = { blocked: 2, done: 1 };

export function pickAttention(list, current) {
  const candidates = list.filter((a) => URGENCY[a.status] && a.address !== current);
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((a) => URGENCY[a.status]));
  return candidates.find((a) => URGENCY[a.status] === top);
}

export function keyLabel(binding, mac) {
  if (!binding) return null;
  const names = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
  const parts = binding.endsWith("--") ? [...binding.slice(0, -2).split("-"), "-"] : binding.split("-");
  return parts.map((p) => names[p.toLowerCase()] ?? p.toUpperCase()).join("");
}

function jumpToAttention() {
  const now = focused();
  const target = pickAttention(agents(), now?.agent ?? now?.terminal ?? null);
  if (target) {
    run("agent.focus", { terminal: target.address });
  } else {
    notify({ title: "No agent needs attention", level: "info", timeout: 2000 });
  }
}

export default class StatusHints extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === JUMP_COMMAND) jumpToAttention();
        cx.notify();
      }
    });
  }

  bound(action) {
    const mac = window()?.platform === "macos";
    const b = keys().find((k) => k.section === "global" && k.action === action);
    return keyLabel(b?.keys, mac);
  }

  hint(id, text, onClick) {
    return div().id(id).text_color(theme().dim).on_click(onClick).child(text);
  }

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = agents();
    const needs = list.filter((a) => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const prevSpaceKey = this.bound("space.prev");
    const nextSpaceKey = this.bound("space.next");
    const jumpKey = this.bound(JUMP_ACTION);
    const paletteKey = this.bound("app.palette");
    const markdownKey = this.bound(MARKDOWN_ACTION);
    const containersKey = this.bound(CONTAINERS_ACTION);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .when(Boolean(space?.machine), (el) => el.child(label("server", space.machine)))
      .when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .when(Boolean(prevSpaceKey), (el) => el.child(this.hint("prev-space", `${prevSpaceKey}  prev space`, () => run("space.prev"))))
      .when(Boolean(nextSpaceKey), (el) => el.child(this.hint("next-space", `${nextSpaceKey}  next space`, () => run("space.next"))))
      .when(Boolean(jumpKey), (el) => el.child(this.hint("attention", `${jumpKey}  waiting agent`, () => jumpToAttention())))
      .when(Boolean(markdownKey), (el) => el.child(this.hint("markdown", `${markdownKey}  md`, () => run("mod.open", { name: MARKDOWN_MOD }))))
      .when(Boolean(containersKey), (el) => el.child(this.hint("containers", `${containersKey}  containers`, () => run("mod.open", { name: CONTAINERS_MOD }))))
      .child(this.hint("palette", paletteKey ? `${paletteKey}  commands` : "commands", () => run("app.palette")));
  }
}
