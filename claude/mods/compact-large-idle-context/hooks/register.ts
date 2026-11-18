import type { EngineInterface, ModelUsage, Register } from 'claude-code'

const IDLE_MS = 30 * 60 * 1000

let isTurnRunning = false
let lastTurnAt: number | null = null

const formatCount = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const formatMinutes = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const describeCompaction = (tokens: number, usage?: ModelUsage) => {
  const head = `Compacted idle context of ${formatCount(tokens)} tokens`
  if (!usage) return head
  const { cache_read_input_tokens: read, cache_creation_input_tokens: write, input_tokens: uncached } = usage
  const total = read + write + uncached
  if (total === 0) return head
  const rate = ((read / total) * 100).toFixed(1)
  return `${head}; summary cache hit ${rate}% (read ${formatCount(read)} / write ${formatCount(write)} / uncached ${formatCount(uncached)})`
}

const describeTiming = (sinceTurn: number | null) => {
  const turn = isTurnRunning ? 'a turn running' : 'no turn running'
  const since = sinceTurn === null ? 'no turn yet' : `${formatMinutes(sinceTurn)} since the last turn`
  return `${turn}, ${since}`
}

async function log($: EngineInterface, text: string, to?: 'debug') {
  try {
    await $.ui.log(to ? `compact-large-idle-context: ${text}` : text, to ? { to } : undefined)
  } catch {}
}

async function markTurn($: EngineInterface, running: boolean) {
  isTurnRunning = running
  lastTurnAt = await $.clock.now()
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await markTurn($, true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    if (e.agentId === undefined) await markTurn($, false)
    return completed
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const sinceTurn = lastTurnAt === null ? null : (await $.clock.now()) - lastTurnAt
    await log($, `${e.trigger} compaction, ${describeTiming(sinceTurn)}`, 'debug')
    const isIdle = e.trigger === 'auto' && !isTurnRunning && sinceTurn !== null && sinceTurn >= IDLE_MS
    const result = await next(e)
    if (isIdle && result.skip === undefined) {
      await log($, describeCompaction(result.tokensBefore ?? 0, result.usage))
    }
    return result
  })
}
