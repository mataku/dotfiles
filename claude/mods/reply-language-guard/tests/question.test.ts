import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const standInEngine = (on: On) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
}

const ask = (question: string, options: { label: string; description: string; preview?: string }[]) => ({
  tool: 'AskUserQuestion' as const,
  questions: [{ question, header: 'Choice', options, multiSelect: false }],
})

const ENGLISH_QUESTION = ask('Which approach should I take for the cache invalidation?', [
  { label: 'Clear on write', description: 'Drop the cached entry whenever the file is saved' },
  { label: 'Expire by time', description: 'Keep entries for five minutes and then fetch again' },
])

const JAPANESE_QUESTION = ask('キャッシュの無効化はどちらの方法にしますか?', [
  { label: 'Clear on write', description: 'ファイルを保存するたびにキャッシュを消します' },
  { label: 'Expire by time', description: '5 分間保持して、その後に取り直します' },
])

test('an English question is denied with a reason in Japanese', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const r = await $.tool.call(ENGLISH_QUESTION)
  expect(typeof r.deny).toBe('string')
  expect(r.deny).toContain('日本語')
})

test('a Japanese question with English labels passes', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const r = await $.tool.call(JAPANESE_QUESTION)
  expect(r.deny).toBeUndefined()
})

test('English inside a preview is not counted', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const preview = 'export const register = on => {\n  on("tool.call", ($, e, next) => next(e))\n}\n'.repeat(5)
  const r = await $.tool.call(
    ask('どちらの書き方にしますか?', [
      { label: 'A 案', description: 'hook を 1 つにまとめます', preview },
      { label: 'B 案', description: 'hook をツールごとに分けます', preview },
    ]),
  )
  expect(r.deny).toBeUndefined()
})

test('a second English question in the same turn passes', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call(ENGLISH_QUESTION)
  const r = await $.tool.call(ENGLISH_QUESTION)
  expect(r.deny).toBeUndefined()
})

test('an English question in the next turn is denied again', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call(ENGLISH_QUESTION)
  await $.turn.start({ text: 'again', turnId: 't2' })
  const r = await $.tool.call(ENGLISH_QUESTION)
  expect(typeof r.deny).toBe('string')
})

test('a subagent turn start does not reset the limit', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call(ENGLISH_QUESTION)
  await $.turn.start({ text: 'look', turnId: 't2', agentId: 'a1' })
  const r = await $.tool.call(ENGLISH_QUESTION)
  expect(r.deny).toBeUndefined()
})

test('other tools pass', async ($, on) => {
  standInEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo Which approach should I take for the cache invalidation here' })
  expect(r.deny).toBeUndefined()
})
