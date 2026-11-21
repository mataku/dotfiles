# Mod design

Shared parts for the mods in this folder. Herdr loads a module only from inside the mod's own folder (after resolving symlinks), so the mods cannot import a common file. This document is the common file: write each part below exactly as shown, and change a part here and in every mod that uses it in the same commit.

## Rules

- Colors come from `theme()` only. Never write a hex color.
- Icons are referenced by path from the app home. Reuse `mods/simulators/icons/play.svg`, `stop.svg` and `reload.svg` for start, stop and reload before adding a new file.
- Prefix every element id with the mod name (`containers-row-<key>`).
- A list keeps one cursor on an item, and group headings are never selected.
- Keys mean the same in every list: `up` / `down` move the cursor, `enter` runs the main action of the row, `r` reloads, `escape` closes an overlay. A panel receives them as mod commands through `nextCommand()`; an overlay focuses its own handle and reads them in `on_key_down`.
- An action that takes time shows the busy label and spinner on its row and hides the row's buttons until it ends.
- Text sizes: 12.5 for titles and row names, 11.5 for secondary text.

## Surface

A side panel rests on `t.chrome`; a popup or dialog rests on `t.popover`. The snippets take that color as `surface`.

## Header

```js
h_flex().h(36).px(14).gap(8).flex_none().items_center().border_b(1).border_color(t.border)
  .child(div().flex_1().text_size(12.5).font_semibold().text_color(t.foreground).child(title))
  .child(div().flex_none().text_size(11.5).text_color(t.dim).child(status))
  .child(reloadButton)
```

## Reload button

```js
div().id(`${mod}-reload`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
  .text_color(t.muted).hover((style) => style.bg(t.hover).text_color(t.foreground))
  .tooltip("Reload")
  .on_click((_event, cx) => reload(cx))
  .child(loading ? svg(RELOAD_ICON).size(14).spin(900) : svg(RELOAD_ICON).size(14))
```

## List body

```js
v_flex().id(`${mod}-scroll`).flex_1().min_h(0).p(6).gap(1).overflow_y_scrollbar().children(rows)
```

That is for a panel, which has a height. A popup is as tall as what it holds, so there the list takes an explicit height in place of `flex_1().min_h(0)`: `.h(height).flex_none()`, with the height added up from the rows and capped. Without it, whatever stands below the list is pushed out of the popup.

## Group heading

```js
h_flex().id(`${mod}-group-${group.key}`).h(28).px(8).gap(6).flex_none().items_center().rounded(6)
  .text_size(11.5).text_color(t.dim)
  .child(div().flex_1().min_w(0).truncate().font_semibold().child(group.title))
  .child(div().flex_none().child(count))
```

A heading that folds adds `.hover((style) => style.bg(t.hover))`, an `on_click` that toggles it, and a first child `div().w(10).flex_none().child(open ? "▾" : "▸")`.

## Row

```js
h_flex().id(`${mod}-row-${item.key}`).h(30).pl(24).pr(8).gap(8).flex_none().items_center().rounded(6)
  .bg(atCursor ? t.selected : surface).hover((style) => style.bg(t.hover))
  .child(statusDot)
  .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(active ? t.foreground : t.muted).child(name))
```

More columns go between the name and the action button, each `flex_none` with a fixed width, in 11.5 and `t.dim` or `t.muted`.

## Status dot

```js
div().size(7).flex_none().rounded(3.5).bg(active ? t.working : t.border)
```

## Action button

```js
const stopPress = (_event, cx) => cx.stop_propagation();

div().id(`${mod}-act-${item.key}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
  .border(1).border_color(t.border).text_color(t.muted)
  .hover((style) => style.bg(t.hover).text_color(t.foreground))
  .tooltip(label)
  .on_mouse_down("left", stopPress)
  .on_click((_event, cx) => { cx.stop_propagation(); perform(cx); })
  .child(svg(icon).size(11))
```

## Busy

```js
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 90;

row
  .child(div().text_size(11.5).text_color(t.dim).child(busyLabel))
  .child(div().w(12).text_size(12).text_color(t.dim).frames(SPINNER, SPINNER_MS))
```

A row with columns puts the busy label in its status column and the spinner alone in the button's 24px slot (`div().size(24).flex_none().flex().items_center().justify_center()`), so the columns do not move.

## Empty and error text

```js
div().p(10).text_size(12).text_color(t.dim).child(emptyText)
div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked).truncate().child(errorText)
```
