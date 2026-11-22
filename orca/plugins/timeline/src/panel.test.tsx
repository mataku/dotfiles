import { afterEach, assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import * as panelModule from './panel'
import type { PlanEntry } from './plan'

const entry = (terminal: string, title: string, percent: number): PlanEntry => ({
  terminal,
  agent: 'claude',
  updatedAt: 5,
  plan: {
    title,
    percent,
    done: 1,
    total: 2,
    tasks: [
      { id: '1', title: 'Research', status: 'done', share: 0.5, children: [] },
      { id: '2', title: 'Build', status: 'blocked', share: 0.5, note: 'needs a token', children: [] }
    ]
  }
})

const context = (terminals: { id: string; title?: string }[]) => ({
  context: { workspaceId: 'w1', branch: 'main', displayName: 'app', terminals }
})

let panel: TestPanel | undefined
afterEach(() => panel?.unmount())

test('says so when no agent in the workspace has a plan', async () => {
  const host = mockHost({ capabilities: ['workspace:read', 'agent:read'], requests: { 'plans.list': () => ({ plans: [] }) } })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a' }]))
  assert.deepEqual(panel.summary(), ['EmptyState "No plan yet"'])
  assert.deepEqual(panel.errors, [])
})

test('draws the plan of the workspace terminal and follows the worker', async () => {
  let plans = [entry('term_a', 'Ship timeline', 50)]
  const asked: string[][] = []
  const host = mockHost({
    capabilities: ['workspace:read', 'agent:read'],
    requests: {
      'plans.list': ({ terminals }) => {
        asked.push(terminals)
        return { plans }
      }
    }
  })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a', title: 'claude' }]))
  assert.deepEqual(asked.at(-1), ['term_a'])
  assert.ok(panel.find({ text: 'Ship timeline' }))
  assert.ok(panel.find({ text: '50% · 1/2 tasks' }))
  assert.ok(panel.find({ text: 'needs a token' }))

  plans = [entry('term_a', 'Ship timeline', 100)]
  await panel.post('plans.changed', {})
  assert.ok(panel.find({ text: '100% · 1/2 tasks' }))
  assert.deepEqual(panel.errors, [])
  assert.deepEqual(panel.refusals, [])
})

test('lists the agents when several have a plan and shows the one picked', async () => {
  const host = mockHost({
    capabilities: ['workspace:read', 'agent:read'],
    requests: { 'plans.list': () => ({ plans: [entry('term_a', 'First plan', 10), entry('term_b', 'Second plan', 20)] }) }
  })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a', title: 'api' }, { id: 'term_b', title: 'web' }]))
  assert.ok(panel.find({ text: 'First plan' }))
  await panel.press({ type: 'ListItem', label: 'web' })
  assert.ok(panel.find({ text: 'Second plan' }))
  assert.equal(panel.find({ text: 'First plan' }), null)
  assert.deepEqual(panel.errors, [])
})

const agent = (terminalId: string | null, sessionId: string | null) => ({
  terminalId,
  title: null,
  agent: 'claude',
  state: 'working' as const,
  stateStartedAt: 1,
  sessionId
})

test('draws the plan of a chat agent, which has no terminal, asked for by its session id', async () => {
  const asked: string[][] = []
  const host = mockHost({
    capabilities: ['workspace:read', 'agent:read'],
    results: { 'agents.list': { agents: [agent(null, 'session-1'), agent('term_a', 'session-2'), agent(null, null)] } },
    requests: {
      'plans.list': ({ terminals }) => {
        asked.push(terminals)
        return { plans: [entry('session-1', 'Chat plan', 50)] }
      }
    }
  })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a', title: 'api' }]))
  assert.deepEqual(asked.at(-1), ['term_a', 'session-1'])
  assert.ok(panel.find({ text: 'Chat plan' }))
  assert.deepEqual(panel.errors, [])
  assert.deepEqual(panel.refusals, [])
})

test('asks for the chat of a workspace without terminals', async () => {
  const asked: string[][] = []
  const host = mockHost({
    capabilities: ['workspace:read', 'agent:read'],
    results: { 'agents.list': { agents: [agent(null, 'session-1')] } },
    requests: {
      'plans.list': ({ terminals }) => {
        asked.push(terminals)
        return { plans: [] }
      }
    }
  })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([]))
  assert.deepEqual(asked.at(-1), ['session-1'])
})

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

const marksOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(marksOf)
  if (typeof node !== 'object' || node === null) return []
  const { type, props, children = [] } = node as Drawn
  const mark = type === 'Text' && (children[0] === '●' || children[0] === '○') ? [`${children[0]} ${props?.size} ${props?.muted ? 'muted' : props?.tone}`] : []
  return [...mark, ...marksOf(children)]
}

test('marks each task with a small mark in the color of its status', async () => {
  const plan: PlanEntry = {
    ...entry('term_a', 'Ship timeline', 25),
    plan: {
      title: 'Ship timeline',
      percent: 25,
      done: 1,
      total: 4,
      tasks: (['done', 'in_progress', 'blocked', 'pending'] as const).map((status) => ({ id: status, title: status, status, share: 0.25, children: [] }))
    }
  }
  const host = mockHost({ capabilities: ['workspace:read', 'agent:read'], requests: { 'plans.list': () => ({ plans: [plan] }) } })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a' }]))
  assert.deepEqual(marksOf(panel.tree()), ['● xs accent', '● xs warning', '● xs danger', '○ xs muted'])
  assert.deepEqual(panel.warnings, [])
})

const railsOf = (node: unknown): number => {
  if (Array.isArray(node)) return node.reduce((sum: number, child) => sum + railsOf(child), 0)
  if (typeof node !== 'object' || node === null) return 0
  const { type, props, children = [] } = node as Drawn
  return (type === 'Separator' && props?.orientation === 'vertical' ? 1 : 0) + railsOf(children)
}

test('draws a line under a task that has children or a later sibling, and through the rows under an ancestor that has one', async () => {
  const leaf = (id: string, children: PlanEntry['plan']['tasks'] = []) => ({ id, title: id, status: 'pending' as const, share: 0, children })
  const plan: PlanEntry = { ...entry('term_a', 'Ship timeline', 0), plan: { title: 'Ship timeline', percent: 0, done: 0, total: 4, tasks: [leaf('a', [leaf('a1'), leaf('a2')]), leaf('b')] } }
  const host = mockHost({ capabilities: ['workspace:read', 'agent:read'], requests: { 'plans.list': () => ({ plans: [plan] }) } })
  panel = await mount(panelModule, { host })
  await panel.emit('workspace.changed', context([{ id: 'term_a' }]))
  assert.equal(railsOf(panel.tree()), 4)
  assert.deepEqual(panel.warnings, [])
  assert.deepEqual(panel.errors, [])
})
