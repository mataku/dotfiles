const charWidth = (codePoint: number) =>
  (codePoint >= 0x1100 && codePoint <= 0x115f) ||
  (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
  (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
  (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
  (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
  (codePoint >= 0xff00 && codePoint <= 0xff60) ||
  (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
  (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
  (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    ? 2
    : 1

export const textWidth = (text: string) => [...text].reduce((sum, ch) => sum + charWidth(ch.codePointAt(0) ?? 0), 0)

export const truncate = (text: string, columns: number) => {
  if (textWidth(text) <= columns) return text
  if (columns <= 0) return ''
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0) ?? 0)
    if (used + w > columns - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}
