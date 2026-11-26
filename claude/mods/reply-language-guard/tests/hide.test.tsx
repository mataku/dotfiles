import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const ENGLISH = 'I updated the configuration file and ran the tests.\nEverything passes now.'

const block = (text: string) =>
  ({
    plugin: 'reply-language-guard',
    component: 'AssistantMessage',
    requestId: 'block-1',
    surface: 'terminal',
    props: { text, isFirstOfReply: true },
  }) as const

const standInEngine = (on: On) => {
  on('classic.Stop', () => ({}))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('a reply that was sent back is drawn as nothing', async ($, on) => {
  standInEngine(on)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH })

  const ui = await $.ui.mount(block(ENGLISH))
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('one block of a sent-back reply is drawn as nothing', async ($, on) => {
  standInEngine(on)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH })

  const ui = await $.ui.mount(block('Everything passes now.'))
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('a reply that was not sent back is drawn by the engine', async ($, on) => {
  standInEngine(on)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: '設定ファイルを更新しました。' })

  const ui = await $.ui.mount(block('設定ファイルを更新しました。'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the rewrite after a send-back is drawn by the engine', async ($, on) => {
  standInEngine(on)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH })
  await $.classic.Stop({ stop_hook_active: true, last_assistant_message: '設定ファイルを更新し、テストはすべて通りました。' })

  const ui = await $.ui.mount(block('設定ファイルを更新し、テストはすべて通りました。'))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('an empty block is drawn by the engine', async ($, on) => {
  standInEngine(on)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: ENGLISH })

  const ui = await $.ui.mount(block('   '))
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
