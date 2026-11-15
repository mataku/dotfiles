import { expect, test } from 'claude-code/testing'

import { PlanError, applyUpdate, describePane, formatTree, isFinished, leafCounts, parsePlan, progressOf } from '../hooks/plan'

const sample = () =>
  parsePlan({
    title: 'Ship timeline',
    tasks: [
      { title: 'Research', status: 'done' },
      {
        title: 'Build',
        weight: 2,
        children: [
          { title: 'Tree', status: 'done' },
          { title: 'Bar', status: 'in_progress' },
        ],
      },
      { title: 'CI' },
    ],
  })

const idsOf = (plan: ReturnType<typeof sample>) => plan.tasks.flatMap(t => [t.id, ...t.children.map(c => c.id)])

const failure = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof PlanError ? error.message : `unexpected: ${String(error)}`
  }
  return undefined
}

test('assigns ids by position when none is given', async () => {
  expect(idsOf(sample())).toEqual(['1', '2', '2.1', '2.2', '3'])
})

test('keeps a given id and numbers around it', async () => {
  const plan = parsePlan({ title: 'T', tasks: [{ id: 'setup', title: 'A' }, { title: 'B' }] })
  expect(plan.tasks.map(t => t.id)).toEqual(['setup', '2'])
})

test('weights compare siblings', async () => {
  const plan = parsePlan({
    title: 'T',
    tasks: [
      { title: 'A', weight: 3, status: 'done' },
      { title: 'B', weight: 1 },
    ],
  })
  expect(progressOf(plan.tasks)).toBe(0.75)
})

test('subtasks divide their parent share', async () => {
  const plan = sample()
  expect(progressOf(plan.tasks)).toBe(0.5)
  expect(leafCounts(plan.tasks)).toEqual({ done: 2, total: 4 })
  expect(isFinished(plan)).toBe(false)
})

test('splitting a task keeps its share', async () => {
  const plan = applyUpdate(sample(), {
    add: [{ parent: '3', tasks: [{ title: 'Workflow', status: 'done' }, { title: 'Assertions' }] }],
  })
  expect(progressOf(plan.tasks)).toBe(0.625)
  expect(plan.tasks[2]?.children.map(c => c.id)).toEqual(['3.1', '3.2'])
})

test('adds a top-level task after the last one', async () => {
  const plan = applyUpdate(sample(), { add: [{ tasks: [{ title: 'Docs' }] }] })
  expect(plan.tasks.map(t => t.id)).toEqual(['1', '2', '3', '4'])
  expect(progressOf(plan.tasks)).toBe(0.4)
})

test('updates a status, a note and a title by id', async () => {
  const plan = applyUpdate(sample(), {
    updates: [
      { id: '2.2', status: 'done', note: 'drawn with blocks' },
      { id: '3', title: 'CI checks' },
    ],
  })
  expect(plan.tasks[1]?.children[1]).toEqual({
    id: '2.2',
    title: 'Bar',
    weight: 1,
    status: 'done',
    note: 'drawn with blocks',
    children: [],
  })
  expect(plan.tasks[2]?.title).toBe('CI checks')
  expect(progressOf(plan.tasks)).toBe(0.75)
})

test('does not change the plan it was given', async () => {
  const before = sample()
  applyUpdate(before, { updates: [{ id: '3', status: 'done' }] })
  expect(before).toEqual(sample())
})

test('a parent marked done finishes every subtask', async () => {
  const plan = applyUpdate(sample(), { updates: [{ id: '2', status: 'done' }, { id: '3', status: 'done' }] })
  expect(plan.tasks[1]?.children.map(c => c.status)).toEqual(['done', 'done'])
  expect(isFinished(plan)).toBe(true)
})

test('a parent marked in_progress starts its first unfinished subtask', async () => {
  const start = parsePlan({ title: 'T', tasks: [{ title: 'P', children: [{ title: 'a', status: 'done' }, { title: 'b' }, { title: 'c' }] }] })
  const plan = applyUpdate(start, { updates: [{ id: '1', status: 'in_progress' }] })
  expect(plan.tasks[0]?.children.map(c => c.status)).toEqual(['done', 'in_progress', 'pending'])
})

test('a parent marked blocked blocks its unfinished subtasks', async () => {
  const plan = applyUpdate(sample(), { updates: [{ id: '2', status: 'blocked' }] })
  expect(plan.tasks[1]?.children.map(c => c.status)).toEqual(['done', 'blocked'])
})

test('refuses input it cannot hold', async () => {
  expect(failure(() => parsePlan({ title: '', tasks: [{ title: 'A' }] }))).toMatch(/title/)
  expect(failure(() => parsePlan({ title: 'T', tasks: [] }))).toMatch(/at least one task/)
  expect(failure(() => parsePlan({ title: 'T', tasks: [{ title: ' ' }] }))).toMatch(/title/)
  expect(failure(() => parsePlan({ title: 'T', tasks: [{ title: 'A', status: 'started' }] }))).toMatch(/status/)
  expect(failure(() => parsePlan({ title: 'T', tasks: [{ title: 'A', weight: 0 }] }))).toMatch(/weight/)
  expect(failure(() => parsePlan({ title: 'T', tasks: [{ id: 'x', title: 'A' }, { id: 'x', title: 'B' }] }))).toMatch(/duplicate id "x"/)
  const nested = { title: 'a', children: [{ title: 'b', children: [{ title: 'c', children: [{ title: 'd', children: [{ title: 'e' }] }] }] }] }
  expect(failure(() => parsePlan({ title: 'T', tasks: [nested] }))).toMatch(/deeper than 4/)
  expect(failure(() => applyUpdate(sample(), { updates: [{ id: '9', status: 'done' }] }))).toMatch(/unknown task id "9"/)
  expect(failure(() => applyUpdate(sample(), { add: [{ parent: '9', tasks: [{ title: 'A' }] }] }))).toMatch(/unknown task id "9"/)
  expect(failure(() => applyUpdate(sample(), {}))).toMatch(/updates or add/)
})

test('drops control characters and bidi overrides from text it will draw', async () => {
  const plan = parsePlan({ title: 'Ship\u001b[2J it', tasks: [{ id: 'a\u0007', title: 'line one\nline two\u202e', note: 'x\u009b31m' }] })
  expect(plan.title).toBe('Ship [2J it')
  expect(plan.tasks[0]).toEqual({ id: 'a', title: 'line one line two', weight: 1, status: 'pending', note: 'x 31m', children: [] })
  expect(failure(() => parsePlan({ title: '\u001b\u0007', tasks: [{ title: 'A' }] }))).toMatch(/title/)
})

test('the pane lists the title, the bar and the tree', async () => {
  expect(describePane(sample(), 40)).toEqual([
    { key: 'title', text: 'Ship timeline', tone: 'title' },
    { key: 'bar', text: '██████████░░░░░░░░░░ 50% 2/4', tone: 'bar' },
    { key: 'task-1', text: '✓ Research', tone: 'done' },
    { key: 'task-2', text: '● Build', tone: 'in_progress' },
    { key: 'task-2.1', text: '  ✓ Tree', tone: 'done' },
    { key: 'task-2.2', text: '  ● Bar', tone: 'in_progress' },
    { key: 'task-3', text: '○ CI', tone: 'pending' },
  ])
})

test('the pane shows a blocked task with its note', async () => {
  const plan = applyUpdate(sample(), { updates: [{ id: '3', status: 'blocked', note: 'needs a token' }] })
  expect(describePane(plan, 40).at(-1)).toEqual({ key: 'task-3', text: '✗ CI: needs a token', tone: 'blocked' })
})

test('a nearly finished plan never rounds up to 100%', async () => {
  const tasks = [{ title: 'big', weight: 999, status: 'done' }, { title: 'small' }]
  expect(describePane(parsePlan({ title: 'T', tasks }), 40)[1]?.text).toBe('███████████████████░ 99% 1/2')
})

test('a narrow pane shortens the bar and cuts wide text', async () => {
  const plan = parsePlan({ title: 'タイムライン機能を実装する', tasks: [{ title: '進捗バーを描画する', status: 'in_progress' }] })
  expect(describePane(plan, 16).map(row => row.text)).toEqual(['タイムライン機…', '░░░░░░░░░ 0% 0/1', '● 進捗バーを描…'])
})

test('prints the tree with ids, marks, weights and notes', async () => {
  const plan = applyUpdate(sample(), { updates: [{ id: '2.2', note: 'half drawn' }, { id: '3', status: 'blocked' }] })
  expect(formatTree(plan)).toBe(
    [
      'Ship timeline: 50% (2/4)',
      '✓ 1 Research',
      '● 2 Build (weight 2)',
      '  ✓ 2.1 Tree',
      '  ● 2.2 Bar: half drawn',
      '✗ 3 CI',
    ].join('\n'),
  )
})
