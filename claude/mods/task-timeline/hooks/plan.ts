import type { Plan, Task, TaskStatus } from '../types'
import { textWidth, truncate } from './text'

const STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'done', 'blocked']
const MARKS: Record<TaskStatus, string> = { pending: '○', in_progress: '●', done: '✓', blocked: '✗' }
const MAX_DEPTH = 4
const MAX_TASKS = 200
const MAX_TITLE = 120
const MAX_NOTE = 500
const MAX_ID = 40
const BAR_MIN = 4
const BAR_MAX = 20
const EPSILON = 1e-9
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

export class PlanError extends Error {}

export type PaneRow = { key: string; text: string; tone: 'title' | 'bar' | TaskStatus }

const fail = (message: string): never => {
  throw new PlanError(message)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const listOf = (value: unknown, field: string): unknown[] => (Array.isArray(value) ? value : fail(`${field} must be an array`))

const textOf = (value: unknown, field: string, max: number) => {
  if (typeof value !== 'string' || value.trim() === '') return fail(`${field} must be a non-empty string`)
  const text = value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (text === '') return fail(`${field} must be a non-empty string`)
  return [...text].length > max ? fail(`${field} is longer than ${max} characters`) : text
}

const statusOfInput = (value: unknown): TaskStatus =>
  STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : fail(`status must be one of ${STATUSES.join(', ')}`)

const noteOf = (value: unknown) => {
  if (typeof value !== 'string') return fail('note must be a string')
  return value.trim() === '' ? undefined : textOf(value, 'note', MAX_NOTE)
}

const withNote = (task: Task, note: string | undefined): Task => {
  const { note: _dropped, ...rest } = task
  return note === undefined ? rest : { ...rest, note }
}

const isLeaf = (task: Task) => task.children.length === 0

const leavesOf = (tasks: Task[]): Task[] => tasks.flatMap(t => (isLeaf(t) ? [t] : leavesOf(t.children)))

const allOf = (tasks: Task[]): Task[] => tasks.flatMap(t => [t, ...allOf(t.children)])

export const statusOf = (task: Task): TaskStatus => {
  if (isLeaf(task)) return task.status
  const statuses = leavesOf(task.children).map(leaf => leaf.status)
  if (statuses.every(s => s === 'done')) return 'done'
  if (statuses.includes('in_progress')) return 'in_progress'
  if (statuses.includes('blocked')) return 'blocked'
  return statuses.includes('done') ? 'in_progress' : 'pending'
}

const withStatus = (task: Task, status: TaskStatus): Task => {
  if (isLeaf(task)) return { ...task, status }
  if (status === 'done' || status === 'pending') return { ...task, children: task.children.map(c => withStatus(c, status)) }
  if (status === 'blocked') {
    return { ...task, children: task.children.map(c => (statusOf(c) === 'done' ? c : withStatus(c, 'blocked'))) }
  }
  const first = task.children.findIndex(c => statusOf(c) !== 'done')
  return { ...task, children: task.children.map((c, i) => (i === first ? withStatus(c, 'in_progress') : c)) }
}

const freeId = (positional: string, taken: Set<string>) => {
  let id = positional
  while (taken.has(id)) id = `${id}'`
  return id
}

const buildTask = (raw: unknown, positional: string, depth: number, taken: Set<string>): Task => {
  if (!isRecord(raw)) return fail('each task must be an object')
  if (depth > MAX_DEPTH) return fail(`tasks nest deeper than ${MAX_DEPTH} levels`)
  const title = textOf(raw.title, 'task title', MAX_TITLE)
  const id = raw.id === undefined ? freeId(positional, taken) : textOf(raw.id, 'task id', MAX_ID)
  if (taken.has(id)) return fail(`duplicate id "${id}"`)
  taken.add(id)
  const weight = raw.weight === undefined ? 1 : raw.weight
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return fail('weight must be a number above 0')
  const status = raw.status === undefined ? 'pending' : statusOfInput(raw.status)
  const note = raw.note === undefined ? undefined : noteOf(raw.note)
  const children = raw.children === undefined ? [] : buildTasks(raw.children, id, 1, depth + 1, taken)
  const task = withNote({ id, title, weight, status: children.length > 0 ? 'pending' : status, children }, note)
  return children.length > 0 && raw.status !== undefined ? withStatus(task, status) : task
}

const buildTasks = (input: unknown, prefix: string, firstIndex: number, depth: number, taken: Set<string>): Task[] =>
  listOf(input, 'tasks').map((raw, i) => buildTask(raw, prefix === '' ? `${firstIndex + i}` : `${prefix}.${firstIndex + i}`, depth, taken))

const checked = (plan: Plan): Plan =>
  allOf(plan.tasks).length > MAX_TASKS ? fail(`a plan holds at most ${MAX_TASKS} tasks`) : plan

export const parsePlan = (input: unknown): Plan => {
  if (!isRecord(input)) return fail('the plan must be an object')
  const title = textOf(input.title, 'plan title', MAX_TITLE)
  const tasks = buildTasks(input.tasks, '', 1, 1, new Set())
  if (tasks.length === 0) return fail('a plan needs at least one task')
  return checked({ title, tasks })
}

const depthOf = (tasks: Task[], id: string, depth = 1): number | undefined => {
  for (const task of tasks) {
    if (task.id === id) return depth
    const below = depthOf(task.children, id, depth + 1)
    if (below !== undefined) return below
  }
  return undefined
}

const mapTask = (tasks: Task[], id: string, change: (task: Task) => Task): Task[] =>
  tasks.map(task => (task.id === id ? change(task) : { ...task, children: mapTask(task.children, id, change) }))

const knownId = (tasks: Task[], value: unknown) => {
  const id = typeof value === 'string' ? value : fail('a task id must be a string')
  return allOf(tasks).some(t => t.id === id) ? id : fail(`unknown task id "${id}"`)
}

const updated = (tasks: Task[], raw: unknown): Task[] => {
  if (!isRecord(raw)) return fail('each update must be an object')
  const id = knownId(tasks, raw.id)
  const title = raw.title === undefined ? undefined : textOf(raw.title, 'task title', MAX_TITLE)
  const status = raw.status === undefined ? undefined : statusOfInput(raw.status)
  const hasNote = raw.note !== undefined
  const note = hasNote ? noteOf(raw.note) : undefined
  return mapTask(tasks, id, task => {
    const titled = title === undefined ? task : { ...task, title }
    const noted = hasNote ? withNote(titled, note) : titled
    return status === undefined ? noted : withStatus(noted, status)
  })
}

const added = (tasks: Task[], raw: unknown): Task[] => {
  if (!isRecord(raw)) return fail('each addition must be an object')
  const taken = new Set(allOf(tasks).map(t => t.id))
  if (listOf(raw.tasks, 'tasks').length === 0) return fail('an addition needs at least one task')
  if (raw.parent === undefined) return [...tasks, ...buildTasks(raw.tasks, '', tasks.length + 1, 1, taken)]
  const parent = knownId(tasks, raw.parent)
  const depth = (depthOf(tasks, parent) ?? 1) + 1
  return mapTask(tasks, parent, task => ({
    ...task,
    status: 'pending',
    children: [...task.children, ...buildTasks(raw.tasks, task.id, task.children.length + 1, depth, taken)],
  }))
}

export const applyUpdate = (plan: Plan, input: unknown): Plan => {
  if (!isRecord(input)) return fail('the update must be an object')
  const updates = input.updates === undefined ? [] : listOf(input.updates, 'updates')
  const additions = input.add === undefined ? [] : listOf(input.add, 'add')
  if (updates.length === 0 && additions.length === 0) return fail('give updates or add')
  const tasks = additions.reduce(added, updates.reduce(updated, plan.tasks))
  return checked({ ...plan, tasks })
}

export const progressOf = (tasks: Task[]): number => {
  const total = tasks.reduce((sum, t) => sum + t.weight, 0)
  if (total === 0) return 0
  const earned = tasks.reduce((sum, t) => sum + t.weight * (isLeaf(t) ? (t.status === 'done' ? 1 : 0) : progressOf(t.children)), 0)
  return earned / total
}

export const leafCounts = (tasks: Task[]) => {
  const leaves = leavesOf(tasks)
  return { done: leaves.filter(l => l.status === 'done').length, total: leaves.length }
}

export const isFinished = (plan: Plan) => leavesOf(plan.tasks).every(l => l.status === 'done')

const percentOf = (plan: Plan) => Math.floor(progressOf(plan.tasks) * 100 + EPSILON)

const pathsOf = (tasks: Task[], status: TaskStatus, trail: string[] = []): string[] =>
  tasks.flatMap(t =>
    isLeaf(t) ? (t.status === status ? [[...trail, t.title].join(' › ')] : []) : pathsOf(t.children, status, [...trail, t.title]),
  )

export const summarize = (plan: Plan) => {
  const { done, total } = leafCounts(plan.tasks)
  const active = pathsOf(plan.tasks, 'in_progress')
  const tail = isFinished(plan) ? 'All tasks are done.' : active.length > 0 ? `In progress: ${active.join('; ')}` : 'Nothing is in progress.'
  return `${percentOf(plan)}% (${done}/${total}). ${tail}`
}

export const formatTree = (plan: Plan) => {
  const { done, total } = leafCounts(plan.tasks)
  const lines = (tasks: Task[], depth: number): string[] =>
    tasks.flatMap(t => [
      `${'  '.repeat(depth)}${MARKS[statusOf(t)]} ${t.id} ${t.title}${t.weight === 1 ? '' : ` (weight ${t.weight})`}${t.note ? `: ${t.note}` : ''}`,
      ...lines(t.children, depth + 1),
    ])
  return [`${plan.title}: ${percentOf(plan)}% (${done}/${total})`, ...lines(plan.tasks, 0)].join('\n')
}

export const describePane = (plan: Plan, columns: number): PaneRow[] => {
  const { done, total } = leafCounts(plan.tasks)
  const suffix = ` ${percentOf(plan)}% ${done}/${total}`
  const width = Math.min(BAR_MAX, Math.max(BAR_MIN, columns - textWidth(suffix)))
  const filled = Math.floor(progressOf(plan.tasks) * width + EPSILON)
  const rows = (tasks: Task[], depth: number): PaneRow[] =>
    tasks.flatMap(t => {
      const status = statusOf(t)
      const note = t.note && (status === 'blocked' || status === 'in_progress') ? `: ${t.note}` : ''
      const text = `${'  '.repeat(depth)}${MARKS[status]} ${t.title}${note}`
      return [{ key: `task-${t.id}`, text: truncate(text, columns), tone: status }, ...rows(t.children, depth + 1)]
    })
  return [
    { key: 'title', text: truncate(plan.title, columns), tone: 'title' },
    { key: 'bar', text: `${'█'.repeat(filled)}${'░'.repeat(width - filled)}${suffix}`, tone: 'bar' },
    ...rows(plan.tasks, 0),
  ]
}
