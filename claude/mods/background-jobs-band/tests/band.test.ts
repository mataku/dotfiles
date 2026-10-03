import type { AgentInfo, AgentSpawnInput, On, RenderPropsOf } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const SECOND = 1000
const MINUTE = 60 * SECOND
const SURFACES = ['terminal', 'desktop'] as const

const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

type Stub = { agents: AgentInfo[]; nextAgentId: number; listCalls: number; engineDraws: number }

const stubEngine = (on: On): Stub => {
  const stub: Stub = { agents: [], nextAgentId: 1, listCalls: 0, engineDraws: 0 }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('agent.list', () => {
    stub.listCalls++
    return { value: stub.agents }
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${stub.nextAgentId++}` }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    stub.engineDraws++
    return $.ui.resolve(e).Box({ key: 'engine' })
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash') {
      const isBackground = e.run_in_background === true
      return {
        result: {
          stdout: '',
          stderr: '',
          interrupted: false,
          ...(isBackground ? { backgroundTaskId: `b-${e.command.length}` } : {}),
        },
      }
    }
    if (e.tool === 'TaskStop') {
      return { result: { message: 'stopped', task_id: e.task_id ?? '', task_type: 'local_bash' } }
    }
    return { result: {} }
  })
  return stub
}

const start = async ($: Engine, on: On) => {
  const clock = mock.clock(on, { now: 10 * MINUTE })
  const stub = stubEngine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return { clock, stub }
}

const rowsOf = async ($: Engine, surface: (typeof SURFACES)[number], props = BAND) => {
  const ui = await $.ui.mount({ plugin: 'background-jobs-band', surface, component: 'AbovePrompt', props })
  const texts = (await ui.findAll({ type: 'Box' })).filter(b => b.key !== undefined && b.key !== 'engine').map(b => b.text)
  return { ui, texts }
}

const notification = (taskId: string, status: string, summary: string) =>
  [
    '<task-notification>',
    `<task-id>${taskId}</task-id>`,
    `<status>${status}</status>`,
    `<summary>${summary}</summary>`,
    '</task-notification>',
  ].join('\n')

test('draws nothing while no job is known', async ($, on) => {
  await start($, on)
  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface)
    expect(texts).toEqual([])
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    await ui.unmount()
  }
})

test('shows a running background shell with its command and elapsed time', async ($, on) => {
  const { clock } = await start($, on)
  await $.tool.call({ tool: 'Bash', command: './gradlew testDebugUnitTest', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(3 * MINUTE + 10 * SECOND)

  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface)
    expect(texts).toEqual(['⏵ $ ./gradlew testDebugUnitTest · 3m10s'])
    await ui.unmount()
  }
})

test('shows a running background subagent from agent.list with its type and description', async ($, on) => {
  const { clock, stub } = await start($, on)
  stub.agents = [{ id: 't1', description: 'search auth flow', type: 'Explore', status: 'running' }]
  await clock.advance(3 * SECOND)
  await clock.advance(MINUTE + 23 * SECOND)

  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface)
    expect(texts).toEqual(['⏵ Explore  search auth flow · 1m23s'])
    await ui.unmount()
  }
})

test('a background spawn appears at once and a foreground one never does', async ($, on) => {
  const { clock, stub } = await start($, on)
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'update it',
    description: 'update README',
    subagentType: 'general-purpose',
    provider: { plugin: 'core', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } satisfies AgentSpawnInput)
  await $.agent.spawn({
    tool_use_id: 'tu2',
    prompt: 'look',
    description: 'foreground look',
    subagentType: 'Explore',
    provider: { plugin: 'core', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } satisfies AgentSpawnInput)
  stub.agents = [
    { id: 'a1', description: 'update README', type: 'general-purpose', status: 'running' },
    { id: 'a2', description: 'foreground look', type: 'Explore', status: 'running' },
  ]
  await clock.advance(3 * SECOND)

  const { texts } = await rowsOf($, 'terminal')
  expect(texts).toEqual(['⏵ general-purpose  update README · 3s'])
})

test('marks a completed subagent with ✓ and a failed one with a red ✗, both dim', async ($, on) => {
  const { clock, stub } = await start($, on)
  stub.agents = [
    { id: 'a1', description: 'update README', type: 'general-purpose', status: 'running' },
    { id: 'a2', description: 'flaky job', type: 'Explore', status: 'running' },
  ]
  await clock.advance(3 * SECOND)
  stub.agents = [
    { id: 'a1', description: 'update README', type: 'general-purpose', status: 'completed' },
    { id: 'a2', description: 'flaky job', type: 'Explore', status: 'failed' },
  ]
  await clock.advance(3 * SECOND)
  await clock.advance(2 * MINUTE)

  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface)
    expect(texts).toEqual(['✓ general-purpose  update README · done 2m ago', '✗ Explore  flaky job · failed · 2m ago'])
    const cross = await ui.find({ type: 'Text', text: '✗' })
    expect(cross?.props.color).toBe('red')
    const done = await ui.find({ type: 'Text', text: /^✓/ })
    expect(done?.props.dimColor).toBe(true)
    await ui.unmount()
  }
})

test('a task notification ends a shell with ✓ on exit 0 and ✗ with the exit code otherwise', async ($, on) => {
  const { clock } = await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run build', run_in_background: true })
  await $.prompt.submit({
    text: notification('b-8', 'failed', 'Background command "npm test" failed with exit code 1'),
    wait: false,
    origin: { kind: 'task-notification' },
  })
  await clock.advance(10 * SECOND)
  await $.prompt.submit({
    text: notification('b-13', 'completed', 'Background command "npm run build" completed (exit code 0)'),
    wait: false,
    origin: { kind: 'task-notification' },
  })
  await clock.advance(MINUTE)

  const { texts } = await rowsOf($, 'terminal')
  expect(texts).toEqual(['✓ $ npm run build · done 1m ago', '✗ $ npm test · exit 1 · 1m ago'])
})

test('TaskStop marks the shell as killed', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  await $.tool.call({ tool: 'TaskStop', task_id: 'b-8' })

  const { texts } = await rowsOf($, 'terminal')
  expect(texts).toEqual(['✗ $ npm test · killed · just now'])
})

test('the next prompt from the person clears finished jobs but keeps running ones', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 1000', run_in_background: true })
  await $.tool.call({ tool: 'TaskStop', task_id: 'b-8' })
  await $.prompt.submit({
    text: notification('b-unknown', 'completed', 'done'),
    wait: false,
    origin: { kind: 'task-notification' },
  })

  expect((await rowsOf($, 'terminal')).texts).toHaveLength(2)

  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
  expect((await rowsOf($, 'terminal')).texts).toEqual(['⏵ $ sleep 1000 · 0s'])
})

test('a finished job disappears five minutes after it ended', async ($, on) => {
  const { clock } = await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  await $.tool.call({ tool: 'TaskStop', task_id: 'b-8' })

  await clock.advance(5 * MINUTE - SECOND)
  expect((await rowsOf($, 'terminal')).texts).toHaveLength(1)

  await clock.advance(SECOND)
  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface)
    expect(texts).toEqual([])
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    await ui.unmount()
  }
})

test('yields the band to a survey', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface, { ...BAND, hasSurvey: true })
    expect(texts).toEqual([])
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    await ui.unmount()
  }
})

test('cuts the description to fit a narrow band and keeps the tail', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm run test -- --watch=false --coverage --reporter=verbose', run_in_background: true })

  for (const surface of SURFACES) {
    const { ui, texts } = await rowsOf($, surface, { ...BAND, bodyColumns: 30 })
    expect(texts).toEqual(['⏵ $ npm run test -- --wa… · 0s'])
    expect([...(texts[0] ?? '')].length).toBeLessThanOrEqual(30)
    await ui.unmount()
  }
})

test('counts a running subagent tool calls and names the latest tool', async ($, on) => {
  const { clock, stub } = await start($, on)
  stub.agents = [{ id: 'a1', description: 'search auth flow', type: 'Explore', status: 'running' }]
  await clock.advance(3 * SECOND)
  for (const tool of ['Read', 'Read', 'Grep'] as const) {
    const input = { tool, agentId: 'a1', ...(tool === 'Grep' ? { pattern: 'auth' } : { file_path: '/repo/a.ts' }) }
    await $.tool.call(input as unknown as Parameters<typeof $.tool.call>[0])
  }

  const { texts } = await rowsOf($, 'terminal')
  expect(texts).toEqual(['⏵ Explore  search auth flow · 3 tools (Grep) · 0s'])
})

test('keeps an agent with a status other than completed, failed or killed as running', async ($, on) => {
  const { clock, stub } = await start($, on)
  stub.agents = [{ id: 't1', description: 'review', type: 'teammate', status: 'running' }]
  await clock.advance(3 * SECOND)
  stub.agents = [{ id: 't1', description: 'review', type: 'teammate', status: 'idle' }]
  await clock.advance(3 * SECOND)

  expect((await rowsOf($, 'terminal')).texts).toEqual(['⏵ teammate  review · 3s'])

  stub.agents = [{ id: 't1', description: 'review', type: 'teammate', status: 'killed' }]
  await clock.advance(3 * SECOND)
  expect((await rowsOf($, 'terminal')).texts).toEqual(['✗ teammate  review · killed · just now'])
})

test('polls every 15 seconds while nothing is shown and every 3 seconds while a job is shown', async ($, on) => {
  const { clock, stub } = await start($, on)

  await clock.advance(3 * SECOND)
  expect(stub.listCalls).toBe(1)

  await clock.advance(14 * SECOND)
  expect(stub.listCalls).toBe(1)

  await clock.advance(SECOND)
  expect(stub.listCalls).toBe(2)

  stub.agents = [{ id: 'a1', description: 'search auth flow', type: 'Explore', status: 'running' }]
  await clock.advance(15 * SECOND)
  expect(stub.listCalls).toBe(3)

  await clock.advance(3 * SECOND)
  expect(stub.listCalls).toBe(4)
  await clock.advance(3 * SECOND)
  expect(stub.listCalls).toBe(5)
})

test('goes back to the idle interval once the last job is gone', async ($, on) => {
  const { clock, stub } = await start($, on)
  stub.agents = [{ id: 'a1', description: 'search auth flow', type: 'Explore', status: 'running' }]
  await clock.advance(3 * SECOND)
  stub.agents = [{ id: 'a1', description: 'search auth flow', type: 'Explore', status: 'completed' }]
  await clock.advance(3 * SECOND)
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })

  await clock.advance(3 * SECOND)
  const calls = stub.listCalls
  await clock.advance(14 * SECOND)
  expect(stub.listCalls).toBe(calls)
  await clock.advance(SECOND)
  expect(stub.listCalls).toBe(calls + 1)
})

test('redraws each minute only while a job is shown', async ($, on) => {
  const { clock, stub } = await start($, on)
  const idle = await $.ui.mount({ plugin: 'background-jobs-band', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const draws = stub.engineDraws
  await clock.advance(3 * MINUTE)
  await idle.find({ key: 'engine' })
  expect(stub.engineDraws).toBe(draws)
  await idle.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  const busy = await $.ui.mount({ plugin: 'background-jobs-band', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await busy.find({ type: 'Text' }))?.text).toBe('⏵ $ npm test · 0s')
  await clock.advance(MINUTE)
  expect((await busy.find({ type: 'Text' }))?.text).toBe('⏵ $ npm test · 1m00s')
  await busy.unmount()
})
