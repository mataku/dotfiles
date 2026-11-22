export type Status = 'pending' | 'in_progress' | 'done' | 'blocked'

export type Task = {
  id: string
  title: string
  status: Status
  share: number
  note?: string
  children: Task[]
}

export type Plan = {
  title: string
  percent: number
  done: number
  total: number
  tasks: Task[]
}

export type PlanEntry = {
  terminal: string
  agent: string
  updatedAt: number
  plan: Plan
}

export type TaskRow = {
  id: string
  depth: number
  title: string
  status: Status
  note: string | null
  rails: boolean[]
  isJoined: boolean
}

const EXPORT_VERSION = 1
const EXPORT_DIR = '.local/state/agent-timeline'
const TERMINAL_ID = /^[A-Za-z0-9_-]{1,64}$/
const STATUSES: readonly string[] = ['pending', 'in_progress', 'done', 'blocked']
const NOTED: readonly Status[] = ['in_progress', 'blocked']
const MAX_DEPTH = 4
const MAX_TASKS = 200
const MAX_TEXT = 500

type Raw = Record<string, unknown>

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null

const textOf = (value: unknown): string => (typeof value === 'string' ? value.slice(0, MAX_TEXT).trim() : '')

const numberOf = (value: unknown, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0

const statusOf = (value: unknown): Status => (STATUSES.includes(value as string) ? (value as Status) : 'pending')

function tasksOf(input: unknown, depth: number, budget: { left: number }): Task[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return []
  const tasks: Task[] = []
  for (const raw of input) {
    if (budget.left === 0) break
    if (!isRecord(raw)) continue
    const title = textOf(raw.title)
    if (title === '') continue
    budget.left -= 1
    const task: Task = {
      id: textOf(raw.id) || `${depth}-${budget.left}`,
      title,
      status: statusOf(raw.status),
      share: numberOf(raw.share, 1),
      children: tasksOf(raw.children, depth + 1, budget)
    }
    const note = textOf(raw.note)
    tasks.push(note === '' ? task : { ...task, note })
  }
  return tasks
}

/** `undefined` means the text is not JSON yet (a write under way); `null` means there is no plan to show. */
export function parseExport(text: string | null, terminal: string): PlanEntry | null | undefined {
  if (typeof text !== 'string') return null
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(body) || body.version !== EXPORT_VERSION || body.terminal !== terminal || !isRecord(body.plan)) return null
  const tasks = tasksOf(body.plan.tasks, 1, { left: MAX_TASKS })
  if (tasks.length === 0) return null
  return {
    terminal,
    agent: textOf(body.agent),
    updatedAt: numberOf(body.updatedAt, Number.MAX_SAFE_INTEGER),
    plan: {
      title: textOf(body.plan.title) || 'Untitled',
      percent: Math.floor(numberOf(body.plan.percent, 100)),
      done: Math.floor(numberOf(body.plan.done, MAX_TASKS)),
      total: Math.floor(numberOf(body.plan.total, MAX_TASKS)),
      tasks
    }
  }
}

export const folderOf = (home: string): string => `${home}/${EXPORT_DIR}`

export const fileOf = (home: string, terminal: string): string | null =>
  TERMINAL_ID.test(terminal) ? `${folderOf(home)}/${terminal}.json` : null

export function rowsOf(plan: Plan): TaskRow[] {
  const rows = (tasks: Task[], rails: boolean[]): TaskRow[] =>
    tasks.flatMap((task, index) => {
      const hasLaterSibling = index < tasks.length - 1
      return [
        {
          id: task.id,
          depth: rails.length,
          title: task.title,
          status: task.status,
          note: NOTED.includes(task.status) && task.note ? task.note : null,
          rails,
          isJoined: hasLaterSibling || task.children.length > 0
        },
        ...rows(task.children, [...rails, hasLaterSibling])
      ]
    })
  return rows(plan.tasks, [])
}
