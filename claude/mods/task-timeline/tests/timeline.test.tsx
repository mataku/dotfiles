import type { On, RenderPropsOf } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const SET = 'mcp__task-timeline__plan_set'
const UPDATE = 'mcp__task-timeline__plan_update'
const PANE_ID = 'task-timeline'
const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

const PANE: RenderPropsOf['Pane'] = {
  title: 'Timeline',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const TASKS = [
  { title: 'Research', status: 'done' },
  { title: 'Build', children: [{ title: 'Tree', status: 'in_progress' }, { title: 'Bar' }] },
]

type Stub = {
  sessionId: string
  store: Map<string, unknown>
  tools: { name: string; isDeferred: unknown }[]
  commands: string[]
  opened: string[]
  closed: string[]
  files: Map<string, string>
}

const stubEngine = (on: On, entries: Record<string, unknown> = {}, env: Record<string, string> = {}): Stub => {
  const stub: Stub = {
    sessionId: 's1',
    store: new Map(Object.entries(entries)),
    tools: [],
    commands: [],
    opened: [],
    closed: [],
    files: new Map(),
  }
  mock.env(on, env)
  on('fs.write', ($, e) => {
    stub.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: stub.files.has(e.path) }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: stub.sessionId }))
  on('tool.register', ($, e) => {
    stub.tools.push({ name: e.name, isDeferred: e.isDeferred })
    return { value: { tool: `mcp__task-timeline__${e.name}` } }
  })
  on('command.register', ($, e) => {
    stub.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', ($, e) => {
    stub.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    stub.closed.push(e.id)
    return { value: undefined }
  })
  on('store.get', ($, e) => ({ value: stub.store.get(e.key) }))
  on('store.set', ($, e) => {
    stub.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    stub.store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...stub.store.keys()] }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  return stub
}

const start = async ($: Engine, on: On, entries: Record<string, unknown> = {}, env: Record<string, string> = {}) => {
  mock.clock(on, { now: NOW })
  const stub = stubEngine(on, entries, env)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return stub
}

const HERDR_ENV = { HOME: '/home/me', HC_TERMINAL_ID: 't7' }
const EXPORT_FILE = '/home/me/.local/state/agent-timeline/t7.json'

const exported = (stub: Stub) => JSON.parse(stub.files.get(EXPORT_FILE) ?? 'null') as { plan: { percent: number } | null } | null

const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as unknown as Parameters<typeof $.tool.call>[0])

const setPlan = ($: Engine, tasks: unknown = TASKS) => call($, { tool: SET, title: 'Ship timeline', tasks })

const runTimeline = ($: Engine, args = '') =>
  $.command.run({ command: 'timeline', args, origin: { kind: 'composer' } } as unknown as Parameters<typeof $.command.run>[0])

const paneTexts = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'task-timeline', surface: 'terminal', component: 'Pane', requestId: PANE_ID, props: PANE })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts
}

test('registers both tools in the tool list and the command, and opens no pane without a plan', async ($, on) => {
  const stub = await start($, on)
  expect(stub.tools).toEqual([
    { name: 'plan_set', isDeferred: false },
    { name: 'plan_update', isDeferred: false },
  ])
  expect(stub.commands).toEqual(['timeline'])
  expect(stub.opened).toEqual([])
})

test('plan_set opens the pane, draws the tree and answers with the ids', async ($, on) => {
  const stub = await start($, on)
  const answer = await setPlan($)
  expect(answer.result).toBe(
    ['Plan saved.', 'Ship timeline: 50% (1/3)', '✓ 1 Research', '● 2 Build', '  ● 2.1 Tree', '  ○ 2.2 Bar'].join('\n'),
  )
  expect(stub.opened).toEqual([PANE_ID])
  expect(await paneTexts($)).toEqual([
    'Ship timeline',
    '██████████░░░░░░░░░░ 50% 1/3',
    '✓ Research',
    '● Build',
    '  ● Tree',
    '  ○ Bar',
  ])
})

test('plan_update moves the progress and names what is in progress', async ($, on) => {
  await start($, on)
  await setPlan($)
  const answer = await call($, {
    tool: UPDATE,
    updates: [
      { id: '2.1', status: 'done' },
      { id: '2.2', status: 'in_progress' },
    ],
  })
  expect(answer.result).toBe('Plan updated: 75% (2/3). In progress: Build › Bar')
  expect((await paneTexts($))[1]).toBe('███████████████░░░░░ 75% 2/3')
})

test('an update that adds tasks answers with the tree', async ($, on) => {
  await start($, on)
  await setPlan($)
  const answer = await call($, { tool: UPDATE, add: [{ tasks: [{ title: 'Docs' }] }] })
  expect(String(answer.result)).toMatch(/^Plan updated\.\nShip timeline: 33% \(1\/4\)\n/)
  expect(String(answer.result)).toMatch(/○ 3 Docs$/)
})

test('refuses input it cannot hold, with the reason', async ($, on) => {
  const stub = await start($, on)
  expect((await call($, { tool: UPDATE, updates: [{ id: '1', status: 'done' }] })).deny).toMatch(/no plan yet/)
  expect((await setPlan($, [])).deny).toMatch(/at least one task/)
  expect(stub.opened).toEqual([])
  await setPlan($)
  expect((await call($, { tool: UPDATE, updates: [{ id: '9', status: 'done' }] })).deny).toMatch(/unknown task id "9"/)
})

test('a subagent may not write the plan', async ($, on) => {
  const stub = await start($, on)
  expect((await call($, { tool: SET, title: 'T', tasks: TASKS, agentId: 'a1' })).deny).toMatch(/main agent/)
  await setPlan($)
  expect((await call($, { tool: UPDATE, agentId: 'a1', updates: [{ id: '2.1', status: 'done' }] })).deny).toMatch(/main agent/)
  expect(stub.opened).toEqual([PANE_ID])
  expect((await paneTexts($))[1]).toBe('██████████░░░░░░░░░░ 50% 1/3')
})

test('reminds the agent after tool calls without a plan update', { options: { nudgeAfter: 2 } }, async ($, on) => {
  await start($, on)
  await setPlan($)
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toEqual([expect.stringContaining('plan_update')])
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
  await call($, { tool: UPDATE, updates: [{ id: '2.1', note: 'half' }] })
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toEqual([expect.stringContaining('plan_update')])
})

test('does not remind without a plan, for a subagent call, or once the plan is finished', { options: { nudgeAfter: 1 } }, async ($, on) => {
  await start($, on)
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
  await setPlan($)
  expect((await call($, { tool: 'Bash', command: 'ls', agentId: 'a1' })).context).toBeUndefined()
  await call($, { tool: UPDATE, updates: [{ id: '2', status: 'done' }] })
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
})

test('a reminder threshold of 0 turns the reminder off', { options: { nudgeAfter: 0 } }, async ($, on) => {
  await start($, on)
  await setPlan($)
  expect((await call($, { tool: 'Bash', command: 'ls' })).context).toBeUndefined()
})

test('keeps the plan in the store under the session id', async ($, on) => {
  const stub = await start($, on)
  await setPlan($)
  expect(stub.store.get('plan:s1')).toEqual({ savedAt: NOW, plan: expect.objectContaining({ title: 'Ship timeline' }) })
})

test('restores the stored plan of the session at start and drops plans older than 30 days', async ($, on) => {
  const plan = {
    title: 'Restored',
    tasks: [{ id: '1', title: 'A', weight: 1, status: 'in_progress', children: [] }],
  }
  const stub = await start($, on, {
    'plan:s1': { savedAt: NOW - DAY, plan },
    'plan:old': { savedAt: NOW - 31 * DAY, plan },
    'plan:other': { savedAt: NOW - DAY, plan },
  })
  expect(stub.opened).toEqual([PANE_ID])
  expect(await paneTexts($)).toEqual(['Restored', '░░░░░░░░░░░░░░░░░░░░ 0% 0/1', '● A'])
  expect([...stub.store.keys()]).toEqual(['plan:s1', 'plan:other'])
})

test('a finished plan leaves with the next prompt of the person', async ($, on) => {
  const stub = await start($, on)
  await setPlan($)
  await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
  expect(stub.closed).toEqual([])
  await call($, { tool: UPDATE, updates: [{ id: '2', status: 'done' }] })
  await $.prompt.submit({ text: 'done', wait: false, origin: { kind: 'task-notification' } })
  expect(stub.closed).toEqual([])
  await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
  expect(stub.closed).toEqual([PANE_ID])
  expect(stub.store.has('plan:s1')).toBe(false)
  expect(await paneTexts($)).toEqual([])
})

test('a slash command does not make a finished plan leave', async ($, on) => {
  const stub = await start($, on)
  await setPlan($)
  await call($, { tool: UPDATE, updates: [{ id: '2', status: 'done' }] })
  await $.prompt.submit({ text: '/timeline', wait: false, origin: { kind: 'composer' }, command: { name: 'timeline', args: '' } })
  expect(stub.closed).toEqual([])
  expect((await paneTexts($))[0]).toBe('Ship timeline')
})

test('/timeline prints the tree and opens the pane, and /timeline clear drops the plan', async ($, on) => {
  const stub = await start($, on)
  expect((await runTimeline($)).text).toBe('No plan yet.')
  await setPlan($)
  expect((await runTimeline($)).text).toMatch(/^Ship timeline: 50% \(1\/3\)\n✓ 1 Research/)
  expect(stub.opened).toEqual([PANE_ID, PANE_ID])
  expect((await runTimeline($, 'clear')).text).toBe('Plan cleared.')
  expect(stub.closed).toEqual([PANE_ID])
  expect(stub.store.has('plan:s1')).toBe(false)
})

test('a /clear drops the plan of the session it ended and keeps its stored copy', async ($, on) => {
  const stub = await start($, on)
  await setPlan($)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(stub.closed).toEqual([PANE_ID])
  expect(await paneTexts($)).toEqual([])
  expect(stub.store.has('plan:s1')).toBe(true)
})

test('writes no file outside a herdr-core terminal', async ($, on) => {
  const stub = await start($, on, {}, { HOME: '/home/me' })
  await setPlan($)
  expect([...stub.files.keys()]).toEqual([])
  expect(stub.opened).toEqual([PANE_ID])
})

test('in a herdr-core terminal the plan goes to a file named after the terminal, and no pane opens unasked', async ($, on) => {
  const stub = await start($, on, {}, HERDR_ENV)
  expect([...stub.files.keys()]).toEqual([])
  await setPlan($)
  expect(stub.opened).toEqual([])
  expect(JSON.parse(stub.files.get(EXPORT_FILE) ?? 'null')).toEqual({
    version: 1,
    terminal: 't7',
    agent: 'claude',
    updatedAt: NOW,
    plan: {
      title: 'Ship timeline',
      percent: 50,
      done: 1,
      total: 3,
      tasks: [
        { id: '1', title: 'Research', status: 'done', share: 0.5, children: [] },
        {
          id: '2',
          title: 'Build',
          status: 'in_progress',
          share: 0.5,
          children: [
            { id: '2.1', title: 'Tree', status: 'in_progress', share: 0.25, children: [] },
            { id: '2.2', title: 'Bar', status: 'pending', share: 0.25, children: [] },
          ],
        },
      ],
    },
  })
  await call($, { tool: UPDATE, updates: [{ id: '2.1', status: 'done' }] })
  expect(exported(stub)?.plan?.percent).toBe(75)
  await runTimeline($)
  expect(stub.opened).toEqual([PANE_ID])
})

test('in nikol the plan goes to a file named after the session id, and the pane waits to be asked', async ($, on) => {
  const stub = await start($, on, {}, { HOME: '/home/me', TERM_PROGRAM: 'nikol' })
  await setPlan($)
  expect(stub.opened).toEqual([])
  const file = '/home/me/.local/state/agent-timeline/s1.json'
  expect([...stub.files.keys()]).toEqual([file])
  expect(JSON.parse(stub.files.get(file) ?? 'null').terminal).toBe('s1')
})

test('nikol wins over a herdr-core terminal id it inherited', async ($, on) => {
  const stub = await start($, on, {}, { ...HERDR_ENV, TERM_PROGRAM: 'nikol' })
  await setPlan($)
  expect([...stub.files.keys()]).toEqual(['/home/me/.local/state/agent-timeline/s1.json'])
})

test('another terminal, or tmux inside nikol, writes no file and opens the pane', async ($, on) => {
  const stub = await start($, on, {}, { HOME: '/home/me', TERM_PROGRAM: 'tmux' })
  await setPlan($)
  expect([...stub.files.keys()]).toEqual([])
  expect(stub.opened).toEqual([PANE_ID])
})

test('the file says there is no plan once the plan is dropped or the session ends', async ($, on) => {
  const stub = await start($, on, {}, HERDR_ENV)
  await setPlan($)
  await runTimeline($, 'clear')
  expect(exported(stub)).toEqual({ version: 1, terminal: 't7', agent: 'claude', updatedAt: NOW, plan: null })
  await setPlan($)
  await $.session.end({ reason: 'exit', sessionId: 's1' } as unknown as Parameters<typeof $.session.end>[0])
  expect(exported(stub)?.plan).toBe(null)
  expect(stub.store.size).toBe(1)
})

test('a session start replaces the file a crashed session left in its terminal', async ($, on) => {
  mock.clock(on, { now: NOW })
  const stub = stubEngine(on, {}, HERDR_ENV)
  stub.files.set(EXPORT_FILE, JSON.stringify({ version: 1, terminal: 't7', agent: 'claude', updatedAt: 1, plan: { title: 'Old' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(exported(stub)?.plan).toBe(null)
})

test('a terminal id that is not a plain name writes no file', async ($, on) => {
  const stub = await start($, on, {}, { HOME: '/home/me', HC_TERMINAL_ID: '../../x' })
  await setPlan($)
  expect([...stub.files.keys()]).toEqual([])
})
