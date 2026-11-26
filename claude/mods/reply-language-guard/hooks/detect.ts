const FENCED_CODE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm
const INLINE_CODE = /(`+)[\s\S]*?\1/g
const MARKDOWN_LINK = /!?\[[^\]\n]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g
const BARE_URL = /\b(?:https?|ftp|file):\/\/\S+|\bwww\.\S+/gi
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const LATIN = /[A-Za-z]/g
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u30FC\uFF70]/gu
const JSON_FENCE = /^```json[ \t]*\n([\s\S]*?)\n```$/i

const MIN_LATIN = 30
const LATIN_TO_JAPANESE_RATIO = 3

export const isJsonDocument = (text: string): boolean => {
  const trimmed = text.trim()
  const body = (JSON_FENCE.exec(trimmed)?.[1] ?? trimmed).trim()
  if (!body.startsWith('{') && !body.startsWith('[')) return false
  try {
    const value: unknown = JSON.parse(body)
    return typeof value === 'object' && value !== null
  } catch {
    return false
  }
}

export const stripNonProse = (text: string): string =>
  text
    .replace(FENCED_CODE, ' ')
    .replace(INLINE_CODE, ' ')
    .replace(MARKDOWN_LINK, ' ')
    .replace(BARE_URL, ' ')
    .replace(EMAIL, ' ')

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0

export const isMostlyEnglish = (text: string): boolean => {
  if (isJsonDocument(text)) return false
  const prose = stripNonProse(text)
  const latin = count(prose, LATIN)
  const japanese = count(prose, JAPANESE)
  return latin >= MIN_LATIN && latin > LATIN_TO_JAPANESE_RATIO * japanese
}

const QUOTE_LIMIT = 80

export const firstLine = (text: string): string => {
  const line = text.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? ''
  const chars = Array.from(line)
  return chars.length > QUOTE_LIMIT ? `${chars.slice(0, QUOTE_LIMIT).join('')}…` : line
}
