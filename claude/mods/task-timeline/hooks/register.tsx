import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolSpec } from 'claude-code'

import type { Plan } from '../types'
import { PlanError, applyUpdate, describePane, formatTree, isFinished, parsePlan, parseStoredPlan, summarize, viewOf } from './plan'
import type { PaneRow } from './plan'

const PANE = 'task-timeline'
const PANE_TITLE = 'Timeline'
const PANE_COLUMNS = 44
const SET_TOOL = 'mcp__task-timeline__plan_set'
const UPDATE_TOOL = 'mcp__task-timeline__plan_update'
const OWN_TOOLS: readonly string[] = [SET_TOOL, UPDATE_TOOL]
const STORE_PREFIX = 'plan:'
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_NUDGE_AFTER = 24
const PERSON_ORIGINS = ['composer', 'bridge', 'sdk']
const SESSION_LEFT = ['clear', 'resume']
const EXPORT_DIR = '.local/state/agent-timeline'
const EXPORT_VERSION = 1
const EXPORT_AGENT = 'claude'
const TERMINAL_ID = /^[A-Za-z0-9_-]{1,64}$/

const WORKER_DENY = 'The main agent owns the plan. Report your progress, blockers and results to it instead.'
const NO_PLAN_DENY = 'There is no plan yet. Record one with plan_set first.'
const NUDGE =
  'The task plan shown to the user has not been updated for a while. If any task started, finished or got blocked, record it now with plan_update; if the plan no longer matches the work, replace it with plan_set.'

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Optional short id. Left out, the position is used: "1", "2", "2.1".' },
    title: { type: 'string', description: 'What the task achieves, in a few words.' },
    weight: { type: 'number', description: 'Effort relative to its siblings. Default 1.' },
    status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked'], description: 'Default pending.' },
    note: { type: 'string', description: 'Optional result or blocker, one line.' },
    children: { type: 'array', items: { type: 'object' }, description: 'Subtasks, same shape, up to 4 levels deep in all.' },
  },
  required: ['title'],
}

const SET_SPEC: ToolSpec = {
  name: 'plan_set',
  description:
    'Records the plan for multi-step work as a task tree with a progress bar the user sees beside the conversation. Call it before starting work that has 3 or more steps, and again only to replace the whole plan. Tasks may nest through children; weight compares effort among siblings. Then keep it current with plan_update. The answer lists each task with its id.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The goal, 2 to 6 words.' },
      tasks: { type: 'array', items: TASK_SCHEMA, description: 'The top-level tasks, in the order they will be done.' },
    },
    required: ['title', 'tasks'],
  },
  isDeferred: false,
}

const UPDATE_SPEC: ToolSpec = {
  name: 'plan_update',
  description:
    'Updates the plan recorded with plan_set. Mark a task in_progress when you start it and done as soon as it is finished, one call for both when they happen together; mark it blocked with a note when you cannot go on. A status set on a task with subtasks applies to its subtasks. add appends new tasks at the top level or under parent.',
  inputSchema: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked'] },
            note: { type: 'string', description: 'A result or blocker, one line; an empty string removes it.' },
            title: { type: 'string' },
          },
          required: ['id'],
        },
      },
      add: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            parent: { type: 'string', description: 'The id of the task to add under. Left out, the top level.' },
            tasks: { type: 'array', items: TASK_SCHEMA },
          },
          required: ['tasks'],
        },
      },
    },
  },
  isDeferred: false,
}

const planAtom = atom({ plugin: 'task-timeline', key: 'plan' } as const, null as Plan | null)
const isDismissed = atom({ plugin: 'task-timeline', key: 'isDismissed' } as const, false)

const storeKey = async ($: EngineInterface) => `${STORE_PREFIX}${await $.session.id()}`

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: PANE_TITLE, columns: PANE_COLUMNS }).catch(() => undefined)

const inNikol = async ($: EngineInterface) => (await $.env.get('TERM_PROGRAM').catch(() => undefined)) === 'nikol'

const nikolSessionId = async ($: EngineInterface) => ((await inNikol($)) ? $.session.id() : undefined)

const exportTarget = async ($: EngineInterface) => {
  const terminal = (await nikolSessionId($)) || (await $.env.get('HC_TERMINAL_ID'))
  const home = await $.env.get('HOME')
  if (!terminal || !home || !TERMINAL_ID.test(terminal)) return undefined
  return { terminal, path: `${home}/${EXPORT_DIR}/${terminal}.json` }
}

const publish = async ($: EngineInterface, plan: Plan | null) => {
  const target = await exportTarget($)
  if (target === undefined) return
  if (plan === null && !(await $.fs.exists(target.path))) return
  const body = {
    version: EXPORT_VERSION,
    terminal: target.terminal,
    agent: EXPORT_AGENT,
    updatedAt: await $.clock.now(),
    plan: plan === null ? null : viewOf(plan),
  }
  await $.fs.write(target.path, JSON.stringify(body))
}

const publishQuietly = ($: EngineInterface, plan: Plan | null) => publish($, plan).catch(() => undefined)

const openUnasked = async ($: EngineInterface) => {
  if (await read($, isDismissed)) return
  // herdr.app and nikol show the plan in their own panel, so the pane would show it twice.
  if (await $.env.get('HC_TERMINAL_ID').catch(() => undefined)) return
  if (await inNikol($)) return
  await openPane($)
}

const closePane = ($: EngineInterface) => $.ui.close({ id: PANE }).catch(() => undefined)

const persist = async ($: EngineInterface, plan: Plan) =>
  $.store.set(await storeKey($), { savedAt: await $.clock.now(), plan })

const keep = async ($: EngineInterface, plan: Plan) => {
  await update($, planAtom, () => plan)
  await persist($, plan).catch(() => undefined)
  await publishQuietly($, plan)
}

const forget = async ($: EngineInterface, options: { isStoredCopyKept: boolean }) => {
  await update($, planAtom, () => null)
  if (!options.isStoredCopyKept) await storeKey($).then(key => $.store.delete(key)).catch(() => undefined)
  await closePane($)
  await publishQuietly($, null)
}

const storedPlan = (value: unknown): Plan | null => {
  try {
    return parseStoredPlan((value as { plan?: unknown } | undefined)?.plan)
  } catch {
    return null
  }
}

const pruneStore = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const keys = (await $.store.keys()).filter(key => key.startsWith(STORE_PREFIX))
  await Promise.all(
    keys.map(async key => {
      const savedAt = ((await $.store.get(key)) as { savedAt?: unknown } | undefined)?.savedAt
      if (typeof savedAt !== 'number' || now - savedAt > KEEP_MS) await $.store.delete(key)
    }),
  )
}

const restore = async ($: EngineInterface) => {
  await pruneStore($)
  const held = await read($, planAtom)
  const plan = held ?? storedPlan(await $.store.get(await storeKey($)))
  await publishQuietly($, plan)
  if (plan === null) return
  if (held === null) await update($, planAtom, () => plan)
  await openUnasked($)
}

const refusal = (error: unknown) => {
  if (error instanceof PlanError) return { deny: error.message }
  throw error
}

const toneProps = (tone: PaneRow['tone']) => {
  if (tone === 'title' || tone === 'in_progress') return { bold: true }
  if (tone === 'done') return { dimColor: true }
  if (tone === 'blocked') return { color: 'red' as const }
  return {}
}

export const register: Register = (on, options) => {
  const nudgeAfter = typeof options.nudgeAfter === 'number' ? options.nudgeAfter : DEFAULT_NUDGE_AFTER
  let idleCalls = 0

  on('session.start', async ($, e, next) => {
    await $.tool.register(SET_SPEC)
    await $.tool.register(UPDATE_SPEC)
    await $.command.register({
      name: 'timeline',
      description: 'Shows the task plan and opens its pane; "clear" drops the plan',
      argumentHint: '[clear]',
    })
    const result = await next(e)
    await restore($).catch(() => undefined)
    return result
  })

  on('session.end', async ($, e, next) => {
    if (SESSION_LEFT.includes(e.reason)) await forget($, { isStoredCopyKept: true }).catch(() => undefined)
    else await publishQuietly($, null)
    return next(e)
  })

  on('tool.call', { tool: SET_TOOL }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: WORKER_DENY }
    try {
      const plan = parsePlan(e)
      await keep($, plan)
      idleCalls = 0
      await update($, isDismissed, () => false)
      await openUnasked($)
      return { result: `Plan saved.\n${formatTree(plan)}` }
    } catch (error) {
      return refusal(error)
    }
  })

  on('tool.call', { tool: UPDATE_TOOL }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: WORKER_DENY }
    const current = await read($, planAtom)
    if (current === null) return { deny: NO_PLAN_DENY }
    try {
      const plan = applyUpdate(current, e)
      await keep($, plan)
      idleCalls = 0
      await openUnasked($)
      const hasAdded = Array.isArray(e.add) && e.add.length > 0
      return { result: hasAdded ? `Plan updated.\n${formatTree(plan)}` : `Plan updated: ${summarize(plan)}` }
    } catch (error) {
      return refusal(error)
    }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (nudgeAfter <= 0 || e.agentId !== undefined || OWN_TOOLS.includes(String(e.tool)) || result.deny !== undefined) return result
    const plan = await read($, planAtom)
    if (plan === null || isFinished(plan)) return result
    idleCalls += 1
    if (idleCalls < nudgeAfter) return result
    idleCalls = 0
    return { ...result, context: [...(result.context ?? []), NUDGE] }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && PERSON_ORIGINS.includes(e.origin.kind)) {
      const plan = await read($, planAtom)
      if (plan !== null && isFinished(plan)) await forget($, { isStoredCopyKept: false })
    }
    return next(e)
  })

  on('command.run', { command: 'timeline' }, async ($, e) => {
    const plan = await read($, planAtom)
    if (plan === null) return { text: 'No plan yet.' }
    if (e.args.trim() === 'clear') {
      await forget($, { isStoredCopyKept: false })
      return { text: 'Plan cleared.' }
    }
    await update($, isDismissed, () => false)
    await openPane($)
    return { text: formatTree(plan) }
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') await update($, isDismissed, () => true)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const plan = await read($, planAtom)
    const rows = plan === null ? [] : describePane(plan, e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text {...toneProps(row.tone)} wrap="truncate-end">
            {row.text}
          </Text>
        ))}
      </Box>
    )
  })
}
