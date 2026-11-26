import { expect, test } from 'claude-code/testing'

const ENGLISH = 'I updated the configuration file and ran the tests.\nEverything passes now.'

test('a plain English reply is sent back with a reason', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH })
  expect(typeof r.block).toBe('string')
  expect(r.block).toContain('I updated the configuration file and ran the tests.')
  expect(r.block).toContain('日本語')
})

test('the quoted first line is cut to about 80 characters', async ($, on) => {
  on('classic.Stop', () => ({}))
  const line = 'This sentence keeps going '.repeat(10)
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: line })
  expect(r.block).toContain(line.slice(0, 80))
  expect(r.block).not.toContain(line.slice(0, 120))
})

test('a Japanese reply passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: '設定ファイルを更新し、テストを実行しました。' })
  expect(r.block).toBeUndefined()
})

test('English only inside code fences, inline code and URLs passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const text = '次を実行してください。\n```\ngit log --oneline --decorate --graph --all | head -n 20\n```\n`npm run build --workspace packages/something` も使えます。\nhttps://example.com/a/very/long/path/for/the/documentation/page'
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: text })
  expect(r.block).toBeUndefined()
})

test('a short English reply passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Done.' })
  expect(r.block).toBeUndefined()
})

test('a JSON-only reply passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: '{"status": "completed", "message": "All the tests passed successfully"}' })
  expect(r.block).toBeUndefined()
})

test('an English reply after a send-back passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: true, last_assistant_message: ENGLISH })
  expect(r.block).toBeUndefined()
})

test('a missing message passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false })
  expect(r.block).toBeUndefined()
})

test('a subagent stop passes', async ($, on) => {
  on('classic.Stop', () => ({}))
  const r = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH, agent_id: 'a1' })
  expect(r.block).toBeUndefined()
})
