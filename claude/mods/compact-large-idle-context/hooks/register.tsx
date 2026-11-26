import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, SessionMessage, Timer } from 'claude-code'

const MINUTE_MS = 60 * 1000
const DEFAULT_DELAY_MINUTES = 50
const GRACE_MS = 8 * MINUTE_MS
const DEFAULT_MIN_TOKENS = 200_000
const FALLBACK_CHARS = 1500

const DIGEST_INSTRUCTIONS = [
  'After the last section of the summary, add one more block wrapped in <digest> and </digest> tags.',
  'It is shown to the human user, who reads it when scrolling back after this compaction to see where the work stands.',
  'Write it in the language the user writes in, as plain text without Markdown headings or tables.',
  'Start with a summary of the conversation so far in at most 5 lines.',
  'Then list the decisions that are still open, each with what it is waiting on.',
  'Then list the TODOs that remain.',
  'Leave out a list that has no items.',
].join(' ')

const DIGEST = /<digest>([\s\S]*?)<\/digest>/g
const HEADING = 'Idle compaction digest (cleared when you send a message)'
const PERSON_ORIGINS = ['composer', 'bridge', 'sdk']

const digestLines = atom({ plugin: 'compact-large-idle-context', key: 'digest' } as const, [] as string[])

type Reservation = { timer: Timer; endedAt: number; delayMs: number; sessionId: string; generation: number }

let reservation: Reservation | null = null
let generation = 0
let isTurnRunning = false
let isCompacting = false

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

const digestOf = (messages: readonly SessionMessage[]) => {
  const text = messages[0]?.text ?? ''
  const block = [...text.matchAll(DIGEST)].at(-1)
  if (block) return (block[1] ?? '').trim()
  const start = text.indexOf('Summary:\n')
  if (start === -1) return ''
  const summary = text.slice(start + 'Summary:\n'.length).trim()
  return summary.length > FALLBACK_CHARS ? `${summary.slice(0, FALLBACK_CHARS)}…` : summary
}

const positiveNumber = (value: string | undefined) => {
  const n = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

async function delayMs($: EngineInterface) {
  const minutes = positiveNumber(await $.env.get('COMPACT_LARGE_IDLE_CONTEXT_DELAY_MINUTES'))
  return (minutes ?? DEFAULT_DELAY_MINUTES) * MINUTE_MS
}

async function minTokens($: EngineInterface) {
  return positiveNumber(await $.env.get('COMPACT_LARGE_IDLE_CONTEXT_MIN_TOKENS')) ?? DEFAULT_MIN_TOKENS
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

async function fire($: EngineInterface, mine: Reservation) {
  if (reservation !== mine) return
  reservation = null
  try {
    const now = await $.clock.now()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    const elapsed = now - mine.endedAt
    if (elapsed < mine.delayMs || elapsed >= mine.delayMs + GRACE_MS) {
      return debug($, `skipped (${formatMinutes(elapsed)} since the turn ended)`)
    }
    const sessionId = await $.session.id()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    if (sessionId !== mine.sessionId) return debug($, 'skipped (the session changed)')
    const { context } = await $.session.usage()
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    const tokens = context.tokens ?? 0
    const floor = await minTokens($)
    if (isStale(mine)) return debug($, 'skipped (a turn started during the check)')
    if (tokens < floor) return debug($, `skipped (context is ${formatCount(tokens)} tokens)`)
    isCompacting = true
    const result = await $.session.compact({ instructions: DIGEST_INSTRUCTIONS }).finally(() => {
      isCompacting = false
    })
    if (result.skip !== undefined) return debug($, `skipped (compaction vetoed: ${result.skip})`)
    await $.ui.log(describeCompaction(result.tokensBefore ?? tokens, result.usage))
    const lines = digestOf(result.messages)
      .split(/\r?\n/)
      .map(row => row.trimEnd())
      .filter(row => row.trim() !== '')
    await update($, digestLines, () => lines)
  } catch (error) {
    await debug($, `compaction failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isCompacting = false
  }
}

async function clearDigest($: EngineInterface) {
  if ((await read($, digestLines)).length > 0) await update($, digestLines, () => [])
}

async function reserve($: EngineInterface) {
  cancel($, 'rescheduling')
  const expected = generation
  const endedAt = await $.clock.now()
  const sessionId = await $.session.id()
  const delay = await delayMs($)
  if (generation !== expected || isTurnRunning) return
  const mine: Reservation = { timer: { cancel: () => {} }, endedAt, delayMs: delay, sessionId, generation }
  mine.timer = $.clock.after(delay, () => void fire($, mine))
  reservation = mine
  await debug($, `compaction reserved in ${formatMinutes(delay)}`)
}

export const register: Register = on => {
  on('turn.start', ($, e, next) => {
    isTurnRunning = true
    cancel($, 'a turn started')
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

  on('session.end', async ($, e, next) => {
    cancel($, `session ended (${e.reason})`)
    await clearDigest($).catch(() => {})
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (PERSON_ORIGINS.includes(e.origin.kind)) await clearDigest($).catch(() => {})
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const lines = await read($, digestLines)
    if (lines.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>{HEADING}</Text>
        {lines.map((line, i) => (
          <Text key={String(i)} wrap="wrap">
            {line}
          </Text>
        ))}
      </Box>
    )
  })
}
