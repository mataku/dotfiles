import type { EngineInterface, ModelUsage, Register, Timer } from 'claude-code'
import {
  explainArgv,
  type HerdrPane,
  herdrPaneOf,
  nextSeq,
  pinArgv,
  releaseArgv,
  screenStateOf,
  sessionArgv,
  SETTLE_LIMIT_MS,
  SETTLE_MARGIN_MS,
  SETTLE_POLL_MS,
} from './herdr'

const DELAY_MS = 50 * 60 * 1000
const LATEST_MS = 58 * 60 * 1000
const MIN_TOKENS = 200_000

type Reservation = { timer: Timer; endedAt: number; sessionId: string; generation: number }

let reservation: Reservation | null = null
let generation = 0
let isTurnRunning = false
let isCompacting = false
let lastSeq = 0n
let pinned: HerdrPane | null = null

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

const isStale = (mine: Reservation) => generation !== mine.generation || isTurnRunning

function debug($: EngineInterface, text: string) {
  return $.ui.log(`compact-large-idle-context: ${text}`, { to: 'debug' })
}

function cancel($: EngineInterface, why: string) {
  generation++
  if (!reservation) return
  reservation.timer.cancel()
  reservation = null
  debug($, `reservation cancelled (${why})`)
}

async function seq($: EngineInterface) {
  lastSeq = nextSeq(await $.clock.now(), lastSeq)
  return lastSeq
}

async function herdr($: EngineInterface, argv: string[]) {
  try {
    const result = await $.process.run(argv, { timeoutMs: 5000 })
    if (result.exitCode === 0) return result
    await debug($, `herdr ${argv[2]} exited ${result.exitCode}: ${result.stderr.trim()}`)
  } catch (error) {
    await debug($, `herdr ${argv[2]} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  return undefined
}

async function pinHerdrIdle($: EngineInterface) {
  const pane = herdrPaneOf({
    herdr: await $.env.get('HERDR_ENV'),
    pane: await $.env.get('HERDR_PANE_ID'),
    bin: await $.env.get('HERDR_BIN_PATH'),
  })
  if (!pane) return
  if (!(await herdr($, pinArgv(pane, await seq($), await $.session.id())))) return
  pinned = pane
  await debug($, 'herdr pane pinned idle')
}

async function waitForScreenIdle($: EngineInterface, pane: HerdrPane) {
  const startedAt = await $.clock.now()
  while ((await $.clock.now()) - startedAt < SETTLE_LIMIT_MS) {
    const result = await herdr($, explainArgv(pane))
    if (result && screenStateOf(result.stdout) === 'idle') {
      await $.clock.sleep(SETTLE_MARGIN_MS)
      return
    }
    await $.clock.sleep(SETTLE_POLL_MS)
  }
  await debug($, 'herdr screen did not settle idle; handing the pane back anyway')
}

async function unpinHerdr($: EngineInterface, settle: boolean) {
  const pane = pinned
  if (!pane) return
  if (settle) await waitForScreenIdle($, pane)
  if (pinned !== pane) return
  pinned = null
  await herdr($, releaseArgv(pane, await seq($)))
  await herdr($, sessionArgv(pane, await seq($), await $.session.id()))
  await debug($, 'herdr pane handed back')
}

async function fire($: EngineInterface, mine: Reservation) {
  if (reservation !== mine) return
  reservation = null
  try {
    const now = await $.clock.now()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    const elapsed = now - mine.endedAt
    if (elapsed < DELAY_MS || elapsed >= LATEST_MS) {
      return debug($, `skipped (${formatMinutes(elapsed)} since the turn ended)`)
    }
    const sessionId = await $.session.id()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    if (sessionId !== mine.sessionId) return debug($, 'skipped (the session changed)')
    const { context } = await $.session.usage()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    const tokens = context.tokens ?? 0
    if (tokens < MIN_TOKENS) return debug($, `skipped (context is ${formatCount(tokens)} tokens)`)
    isCompacting = true
    await pinHerdrIdle($)
    const result = await $.session.compact().finally(() => {
      isCompacting = false
      void unpinHerdr($, true)
    })
    if (result.skip !== undefined) return debug($, `skipped (compaction vetoed: ${result.skip})`)
    await $.ui.log(describeCompaction(result.tokensBefore ?? tokens, result.usage))
  } catch (error) {
    await debug($, `compaction failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isCompacting = false
  }
}

async function reserve($: EngineInterface) {
  cancel($, 'rescheduling')
  const expected = generation
  const endedAt = await $.clock.now()
  const sessionId = await $.session.id()
  if (generation !== expected || isTurnRunning) return
  const mine: Reservation = { timer: { cancel: () => {} }, endedAt, sessionId, generation }
  mine.timer = $.clock.after(DELAY_MS, () => void fire($, mine))
  reservation = mine
  await debug($, `compaction reserved in ${formatMinutes(DELAY_MS)}`)
}

export const register: Register = on => {
  on('turn.start', ($, e, next) => {
    isTurnRunning = true
    cancel($, 'a turn started')
    void unpinHerdr($, false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    if (e.agentId !== undefined) return completed
    isTurnRunning = false
    if (isCompacting) return completed
    if (e.reason !== 'answer' || e.isAborted) {
      cancel($, `the turn ended with ${e.reason}`)
      return completed
    }
    await reserve($)
    return completed
  })

  on('session.compact', ($, e, next) => {
    if (e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'auto')) {
      cancel($, `${e.trigger} compaction`)
    }
    return next(e)
  })

  on('session.end', ($, e, next) => {
    cancel($, `session ended (${e.reason})`)
    return next(e)
  })
}
