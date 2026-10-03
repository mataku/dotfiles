import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const stubEngine = (on: On) => {
  on('ui.render', { component: 'PromptHint' }, ($, e) => $.ui.resolve(e).Text({ children: e.props.hint }))
}

const hintOf = async ($: Engine, surface: (typeof SURFACES)[number], hint: string) => {
  const ui = await $.ui.mount({
    plugin: 'prompt-hint-trim',
    surface,
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint },
  })
  return (await ui.find({ type: 'Text' }))?.text
}

const CASES: [string, string][] = [
  ['PR #90 · 1 shell · ← for agents', 'PR #90'],
  ['PR #90 · 3 shells', 'PR #90'],
  ['1 shell · ← for agents', ''],
  ['? for shortcuts', '? for shortcuts'],
  ['PR #90 · esc to interrupt', 'PR #90 · esc to interrupt'],
  ['PR #90 · 2 shells running elsewhere', 'PR #90 · 2 shells running elsewhere'],
]

for (const surface of SURFACES) {
  for (const [input, expected] of CASES) {
    test(`${surface}: ${JSON.stringify(input)} becomes ${JSON.stringify(expected)}`, async ($, on) => {
      stubEngine(on)
      expect(await hintOf($, surface, input)).toBe(expected)
    })
  }
}
