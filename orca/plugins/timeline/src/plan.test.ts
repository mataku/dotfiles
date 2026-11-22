import { assert, test } from 'orca/testing'
import { fileOf, parseExport, rowsOf } from './plan'

const TERMINAL = 'term_47050787-2737-4933-87b8-6809f3fade54'

const plan = {
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
      note: 'half way',
      children: [
        { id: '2.1', title: 'Tree', status: 'in_progress', share: 0.25, children: [] },
        { id: '2.2', title: 'Bar', status: 'blocked', share: 0.25, note: 'needs a token', children: [] }
      ]
    }
  ]
}

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, terminal: TERMINAL, agent: 'claude', updatedAt: 5, plan, ...over })

test('reads an exported plan', () => {
  assert.deepEqual(parseExport(file(), TERMINAL), { terminal: TERMINAL, agent: 'claude', updatedAt: 5, plan })
})

test('reads nothing from a file without a plan, of another version, for another terminal, or cut short', () => {
  assert.equal(parseExport(file({ plan: null }), TERMINAL), null)
  assert.equal(parseExport(file({ version: 2 }), TERMINAL), null)
  assert.equal(parseExport(file(), 'term_other'), null)
  assert.equal(parseExport(file().slice(0, 40), TERMINAL), undefined)
  assert.equal(parseExport(null, TERMINAL), null)
})

test('drops what it cannot draw and keeps the rest', () => {
  const odd = {
    title: 7,
    percent: 400,
    done: 'x',
    total: 2,
    tasks: [{ id: '1', title: 'A', status: 'running', share: 9 }, 'junk', { title: '' }]
  }
  assert.deepEqual(parseExport(file({ plan: odd }), TERMINAL)?.plan, {
    title: 'Untitled',
    percent: 100,
    done: 0,
    total: 2,
    tasks: [{ id: '1', title: 'A', status: 'pending', share: 1, children: [] }]
  })
})

test('stops at 4 levels and 200 tasks', () => {
  const nest = (depth: number): unknown => ({
    id: `d${depth}`,
    title: 't',
    status: 'done',
    share: 1,
    children: depth < 6 ? [nest(depth + 1)] : []
  })
  const deep = parseExport(file({ plan: { ...plan, tasks: [nest(1)] } }), TERMINAL)
  assert.deepEqual(deep && rowsOf(deep.plan).map((r) => r.depth), [0, 1, 2, 3])
  const wide = Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, title: 't', status: 'done', share: 0, children: [] }))
  assert.equal(parseExport(file({ plan: { ...plan, tasks: wide } }), TERMINAL)?.plan.tasks.length, 200)
})

test('lists the tree as rows, with a note only where work is under way or stuck', () => {
  const quiet = { ...plan, tasks: [{ ...plan.tasks[0], note: 'kept quiet' }, plan.tasks[1]] }
  const read = parseExport(file({ plan: quiet }), TERMINAL)
  assert.deepEqual(read && rowsOf(read.plan), [
    { id: '1', depth: 0, title: 'Research', status: 'done', note: null, rails: [], isJoined: true },
    { id: '2', depth: 0, title: 'Build', status: 'in_progress', note: 'half way', rails: [], isJoined: true },
    { id: '2.1', depth: 1, title: 'Tree', status: 'in_progress', note: null, rails: [false], isJoined: true },
    { id: '2.2', depth: 1, title: 'Bar', status: 'blocked', note: 'needs a token', rails: [false], isJoined: false }
  ])
})

test('joins a task to its children and its later siblings, and keeps the rail of each ancestor that has a later sibling', () => {
  const leaf = (id: string, children: unknown[] = []) => ({ id, title: id, status: 'pending', share: 0, children })
  const tasks = [leaf('a', [leaf('a1'), leaf('a2', [leaf('a2x')])]), leaf('b')]
  const read = parseExport(file({ plan: { ...plan, tasks } }), TERMINAL)
  assert.deepEqual(
    read && rowsOf(read.plan).map((row) => [row.id, row.rails, row.isJoined]),
    [
      ['a', [], true],
      ['a1', [true], true],
      ['a2', [true], true],
      ['a2x', [true, false], false],
      ['b', [], false]
    ]
  )
})

test('names the file of a plain terminal id only', () => {
  assert.equal(fileOf('/home/me', TERMINAL), `/home/me/.local/state/agent-timeline/${TERMINAL}.json`)
  assert.equal(fileOf('/home/me', 'ssh:box/term_1'), null)
  assert.equal(fileOf('/home/me', '../x'), null)
})
