import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { Job } from '../types'

const POLL_MS = 3000
const FOREGROUND_LIMIT = 200
const TICK_MS = 60 * 1000
const LINGER_MS = 5 * 60 * 1000
const ENDED_STATUSES = ['completed', 'failed', 'killed']
const PERSON_ORIGINS = ['composer', 'bridge', 'sdk']

const jobs = atom({ plugin: 'background-jobs-band', key: 'jobs' } as const, [] as Job[])
const foreground = atom({ plugin: 'background-jobs-band', key: 'foreground' } as const, [] as string[])
const tick = atom({ plugin: 'background-jobs-band', key: 'tick' } as const, 0)

type PendingCalls = { count: number; lastTool: string }

let pollRun = 0
let isPolling = false
const pendingCalls = new Map<string, PendingCalls>()

const isRunning = (job: Job) => job.endedAt === undefined

const isRunningAgent = (job: Job) => job.kind === 'agent' && isRunning(job)

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const charWidth = (codePoint: number) =>
  (codePoint >= 0x1100 && codePoint <= 0x115f) ||
  (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
  (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
  (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
  (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
  (codePoint >= 0xff00 && codePoint <= 0xff60) ||
  (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
  (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
  (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    ? 2
    : 1

const textWidth = (text: string) => [...text].reduce((sum, ch) => sum + charWidth(ch.codePointAt(0) ?? 0), 0)

const truncate = (text: string, columns: number) => {
  if (textWidth(text) <= columns) return text
  if (columns <= 0) return ''
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0) ?? 0)
    if (used + w > columns - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}

const formatElapsed = (ms: number) => {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return `${seconds}s`
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

const formatAgo = (ms: number) => {
  const minutes = Math.floor(Math.max(0, ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m ago`
}

type Row = { mark: string; text: string; isFinished: boolean; isFailed: boolean }

const describeJob = (job: Job, now: number, columns: number): Row => {
  const isFinished = !isRunning(job)
  const isFailed = job.outcome === 'fail'
  const mark = !isFinished ? '⏵' : isFailed ? '✗' : '✓'
  const head = job.kind === 'shell' ? '$ ' : `${job.label}  `
  const segments: string[] = []
  if (!isFinished) {
    if (job.kind === 'agent' && job.toolCalls > 0) {
      const noun = job.toolCalls === 1 ? 'tool' : 'tools'
      segments.push(`${job.toolCalls} ${noun}${job.lastTool ? ` (${job.lastTool})` : ''}`)
    }
    segments.push(formatElapsed(now - job.startedAt))
  } else if (isFailed) {
    if (job.detail) segments.push(job.detail)
    segments.push(formatAgo(now - (job.endedAt ?? now)))
  } else {
    segments.push(`done ${formatAgo(now - (job.endedAt ?? now))}`)
  }
  const tail = segments.map(s => ` · ${s}`).join('')
  const room = columns - textWidth(`${mark} `) - textWidth(head) - textWidth(tail)
  const body = room > 0 ? `${head}${truncate(job.description, room)}${tail}` : truncate(`${head}${job.description}${tail}`, columns - textWidth(`${mark} `))
  return { mark, text: body, isFinished, isFailed }
}

const order = (list: Job[]) => [
  ...list.filter(isRunning).sort((a, b) => a.startedAt - b.startedAt),
  ...list.filter(j => !isRunning(j)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)),
]

const addJob = async ($: EngineInterface, job: Job) => {
  await update($, jobs, list => (list.some(j => j.id === job.id) ? list : [...list, job]))
  if (job.kind === 'agent') startPolling($)
}

const finishJob = ($: EngineInterface, matches: (job: Job) => boolean, endedAt: number, outcome: Job['outcome'], detail?: string) =>
  update($, jobs, list => list.map(j => (isRunning(j) && matches(j) ? { ...j, endedAt, outcome, detail } : j)))

const prune = (list: Job[], now: number) => list.filter(j => isRunning(j) || now - (j.endedAt ?? now) < LINGER_MS)

const reconcile = (list: Job[], agents: AgentInfo[], hidden: string[], now: number) => {
  let next = list
  for (const agent of agents) {
    if (hidden.includes(agent.id)) continue
    const isActive = !ENDED_STATUSES.includes(agent.status)
    const known = next.find(j => j.id === agent.id)
    if (!known) {
      if (!isActive) continue
      next = [...next, { id: agent.id, kind: 'agent', label: agent.type, description: oneLine(agent.description), startedAt: now, toolCalls: 0 }]
      continue
    }
    if (isActive || !isRunning(known)) continue
    const outcome = agent.status === 'completed' ? 'ok' : 'fail'
    next = next.map(j => (j.id === agent.id ? { ...j, endedAt: now, outcome, detail: outcome === 'fail' ? agent.status : undefined } : j))
  }
  return prune(next, now)
}

const poll = async ($: EngineInterface) => {
  const [agents, hidden, now] = await Promise.all([$.agent.list(), read($, foreground), $.clock.now()])
  const current = await read($, jobs)
  const next = reconcile(current, agents, hidden, now)
  await forgetForeground($, agents)
  if (JSON.stringify(next) === JSON.stringify(current)) return
  await update($, jobs, list => reconcile(list, agents, hidden, now))
}

const hasRunningAgent = async ($: EngineInterface) => (await read($, jobs)).some(isRunningAgent)

const flushCalls = async ($: EngineInterface) => {
  if (pendingCalls.size === 0) return
  const calls = new Map(pendingCalls)
  pendingCalls.clear()
  const counted = (job: Job) => (isRunning(job) ? calls.get(job.id) : undefined)
  if (!(await read($, jobs)).some(counted)) return
  await update($, jobs, list =>
    list.map(job => {
      const added = counted(job)
      return added ? { ...job, toolCalls: job.toolCalls + added.count, lastTool: added.lastTool } : job
    }),
  )
}

const schedulePoll = ($: EngineInterface, run: number) => {
  $.clock.after(POLL_MS, () => void pollWhileAgentsRun($, run))
}

function startPolling($: EngineInterface) {
  if (isPolling) return
  isPolling = true
  schedulePoll($, pollRun)
}

const pollWhileAgentsRun = async ($: EngineInterface, run: number) => {
  if (run !== pollRun) return
  let isAgentRunning = true
  try {
    await poll($)
    await flushCalls($)
    isAgentRunning = await hasRunningAgent($)
  } catch {
    isAgentRunning = true
  }
  if (run !== pollRun) return
  if (isAgentRunning) return schedulePoll($, run)
  isPolling = false
  pendingCalls.clear()
}

const catchUp = async ($: EngineInterface) => {
  await poll($)
  if (await hasRunningAgent($)) startPolling($)
}

const refreshTick = async ($: EngineInterface) => {
  const [list, now] = await Promise.all([read($, jobs), $.clock.now()])
  const kept = prune(list, now)
  if (kept.length < list.length) return update($, jobs, current => prune(current, now))
  if (kept.length > 0) await update($, tick, () => now)
}

const forgetForeground = async ($: EngineInterface, agents: AgentInfo[]) => {
  const ended = agents.filter(a => ENDED_STATUSES.includes(a.status)).map(a => a.id)
  const hidden = await read($, foreground)
  if (!hidden.some(id => ended.includes(id))) return
  await update($, foreground, ids => ids.filter(id => !ended.includes(id)))
}

const tagOf = (text: string, tag: string) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim()

const parseNotification = (text: string) => {
  const taskId = tagOf(text, 'task-id')
  const toolUseId = tagOf(text, 'tool-use-id')
  const status = tagOf(text, 'status')
  if ((!taskId && !toolUseId) || !status) return undefined
  const exitCode = tagOf(text, 'summary')?.match(/exit code (-?\d+)/)?.[1]
  return { taskId, toolUseId, status, exitCode: exitCode === undefined ? undefined : Number(exitCode) }
}

const settleNotification = async ($: EngineInterface, text: string) => {
  const note = parseNotification(text)
  if (!note) return
  const now = await $.clock.now()
  const matches = (job: Job) => (note.taskId !== undefined && job.id === note.taskId) || (note.toolUseId !== undefined && job.toolUseId === note.toolUseId)
  const isOk = note.status === 'completed' && (note.exitCode === undefined || note.exitCode === 0)
  const detail = isOk ? undefined : note.exitCode !== undefined && note.exitCode !== 0 ? `exit ${note.exitCode}` : note.status
  await finishJob($, matches, now, isOk ? 'ok' : 'fail', detail)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    pollRun++
    isPolling = false
    pendingCalls.clear()
    const result = await next(e)
    await catchUp($).catch(() => {})
    $.clock.every(TICK_MS, () => void refreshTick($).catch(() => {}))
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const result = await next(e)
    if (result.deny !== undefined || result.agentId === undefined) return result
    const agentId = result.agentId
    if (!e.background) {
      await update($, foreground, ids => [...ids, agentId].slice(-FOREGROUND_LIMIT))
      return result
    }
    await addJob($, {
      id: agentId,
      kind: 'agent',
      label: e.subagentType || 'general-purpose',
      description: oneLine(e.description),
      startedAt,
      toolCalls: 0,
    })
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const result = await next(e)
    if (e.tool !== 'Agent' || result.deny !== undefined || result.isError) return result
    const record = result.result
    if (!('status' in record) || record.status !== 'async_launched') return result
    const agentId = record.agentId
    if (!(await read($, foreground)).includes(agentId)) return result
    await update($, foreground, ids => ids.filter(id => id !== agentId))
    await addJob($, {
      id: agentId,
      kind: 'agent',
      label: e.subagent_type || 'general-purpose',
      description: oneLine(record.description || e.description),
      startedAt: await $.clock.now(),
      toolCalls: 0,
    })
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const startedAt = await $.clock.now()
    const result = await next(e)
    if (e.tool !== 'Bash' || result.deny !== undefined || result.isError) return result
    const taskId = result.result.backgroundTaskId
    if (!taskId) return result
    await addJob($, {
      id: taskId,
      kind: 'shell',
      label: '$',
      description: oneLine(e.command),
      startedAt,
      toolCalls: 0,
      toolUseId: e.tool_use_id,
    })
    return result
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const result = await next(e)
    if (e.tool !== 'TaskStop' || result.deny !== undefined || result.isError) return result
    const taskId = result.result.task_id
    const now = await $.clock.now()
    await finishJob($, job => job.id === taskId, now, 'fail', 'killed')
    return result
  })

  on('tool.call', ($, e, next) => {
    if (e.agentId !== undefined && isPolling) {
      const count = (pendingCalls.get(e.agentId)?.count ?? 0) + 1
      pendingCalls.set(e.agentId, { count, lastTool: String(e.tool) })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      await settleNotification($, e.text)
    } else if (PERSON_ORIGINS.includes(e.origin.kind) && (await read($, jobs)).some(j => !isRunning(j))) {
      await update($, jobs, list => list.filter(isRunning))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [list, now] = await Promise.all([read($, jobs), $.clock.now(), read($, tick)])
    const visible = order(prune(list, now))
    if (visible.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    return (
      <Box flexDirection="column">
        {visible.map(job => {
          const row = describeJob(job, now, columns)
          if (row.isFailed) {
            return (
              <Box key={job.id} flexDirection="row">
                <Text color="red">{row.mark}</Text>
                <Text dimColor wrap="truncate-end">
                  {` ${row.text}`}
                </Text>
              </Box>
            )
          }
          return (
            <Box key={job.id} flexDirection="row">
              <Text dimColor={row.isFinished} wrap="truncate-end">
                {`${row.mark} ${row.text}`}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
