import type { On, ProcessRunResult, SessionCompactResult, SessionMessage, TurnCompleteInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const DELAY = 50 * 60 * 1000
const SETTLE_POLL = 250
const SETTLE_MARGIN = 1000
const SETTLE_LIMIT = 10_000

const MESSAGES: SessionMessage[] = [{ role: 'user', text: 'summary', toolUses: [] }]

const HERDR_ENV = { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1' }

type Stub = {
  events: string[]
  argvs: string[][]
  logs: { text: string; to: string }[]
  screen: string[]
  failing: string[]
  compact: () => SessionCompactResult
}

const ok = (stdout = ''): ProcessRunResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const failed = (): ProcessRunResult => ({ ...ok(), exitCode: 1, stderr: 'boom' })

const subcommand = (argv: readonly string[]) =>
  (argv[1] === 'pane' || argv[1] === 'agent' ? argv[2] : argv[1]) ?? ''

const stubEngine = (on: On, env: Record<string, string>, overrides: Partial<Stub> = {}): Stub => {
  const stub: Stub = {
    events: [],
    argvs: [],
    logs: [],
    screen: ['idle'],
    failing: [],
    compact: () => ({ messages: MESSAGES, tokensBefore: 250_000, tokensAfter: 20_000 }),
    ...overrides,
  }
  mock.env(on, env)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 250_000, window: 1_000_000 }, rateLimits: [] },
  }))
  on('session.compact', () => {
    stub.events.push('compact')
    return stub.compact()
  })
  on('process.run', ($, e) => {
    const name = subcommand(e.argv)
    stub.events.push(name)
    stub.argvs.push([...e.argv])
    if (stub.failing.includes(name)) return { value: failed() }
    if (name === 'explain') {
      const state = stub.screen.length > 1 ? stub.screen.shift()! : stub.screen[0]
      return { value: ok(JSON.stringify({ agent: 'claude', state })) }
    }
    return { value: ok() }
  })
  on('ui.log', ($, e) => {
    stub.logs.push({ text: e.text, to: e.to })
    return { value: undefined }
  })
  return stub
}

const answered = (): TurnCompleteInput =>
  ({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' }) as TurnCompleteInput

const argvOf = (stub: Stub, name: string) => stub.argvs.find(argv => subcommand(argv) === name)

const flag = (argv: string[] | undefined, name: string) => argv?.[argv.indexOf(name) + 1]

const reportCalls = (stub: Stub) => stub.events.filter(e => e !== 'explain')

type Clock = ReturnType<typeof mock.clock>
type Engine = { turn: { complete: (e: TurnCompleteInput) => Promise<unknown> } }

const runCompaction = async ($: Engine, clock: Clock) => {
  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()
}

test('outside herdr it compacts without calling herdr', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, {})

  await runCompaction($, clock)
  await clock.advance(SETTLE_LIMIT)

  expect(stub.events).toEqual(['compact'])
})

test('pins the pane idle around the compaction, then hands it back with the session', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV)

  await runCompaction($, clock)
  await clock.advance(SETTLE_MARGIN)

  expect(reportCalls(stub)).toEqual(['report-agent', 'compact', 'release-agent', 'report-agent-session'])

  const pin = argvOf(stub, 'report-agent')
  expect(pin?.slice(0, 4)).toEqual(['herdr', 'pane', 'report-agent', 'w1:p1'])
  expect(flag(pin, '--source')).toBe('herdr:claude')
  expect(flag(pin, '--agent')).toBe('claude')
  expect(flag(pin, '--state')).toBe('idle')
  expect(flag(pin, '--agent-session-id')).toBe('session-1')

  const release = argvOf(stub, 'release-agent')
  expect(flag(release, '--source')).toBe('herdr:claude')
  expect(flag(release, '--agent')).toBe('claude')

  const session = argvOf(stub, 'report-agent-session')
  expect(flag(session, '--source')).toBe('herdr:claude')
  expect(flag(session, '--agent')).toBe('claude')
  expect(flag(session, '--agent-session-id')).toBe('session-1')
})

test('every report carries a strictly increasing nanosecond sequence', async ($, on) => {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const stub = stubEngine(on, HERDR_ENV)

  await runCompaction($, clock)
  await clock.advance(SETTLE_MARGIN)

  const [pin = 0n, release = 0n, session = 0n] = ['report-agent', 'release-agent', 'report-agent-session'].map(
    name => BigInt(flag(argvOf(stub, name), '--seq') ?? '0'),
  )
  expect(pin >= 1_700_000_000_000n * 1_000_000n).toBe(true)
  expect(pin < release && release < session).toBe(true)
})

test('waits for the screen to settle idle before handing the pane back', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV, { screen: ['working', 'working', 'idle'] })

  await runCompaction($, clock)
  await clock.advance(2 * SETTLE_POLL)
  expect(stub.events.includes('release-agent')).toBe(false)

  await clock.advance(SETTLE_MARGIN - 1)
  expect(stub.events.includes('release-agent')).toBe(false)

  await clock.advance(1)
  expect(stub.events.filter(e => e === 'explain').length).toBe(3)
  expect(stub.events.includes('release-agent')).toBe(true)
})

test('hands the pane back after the settle limit even if the screen never looks idle', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV, { screen: ['working'] })

  await runCompaction($, clock)
  await clock.advance(SETTLE_LIMIT - SETTLE_POLL)
  expect(stub.events.includes('release-agent')).toBe(false)

  await clock.advance(SETTLE_POLL)
  expect(reportCalls(stub).slice(-2)).toEqual(['release-agent', 'report-agent-session'])
})

test('hands the pane back when the compaction throws', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV, {
    compact: () => {
      throw new Error('a turn is running')
    },
  })

  await runCompaction($, clock)
  await clock.advance(SETTLE_MARGIN)

  expect(reportCalls(stub)).toEqual(['report-agent', 'compact', 'release-agent', 'report-agent-session'])
})

test('a failed pin still compacts and leaves nothing to hand back', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV, { failing: ['report-agent'] })

  await runCompaction($, clock)
  await clock.advance(SETTLE_LIMIT)

  expect(stub.events).toEqual(['report-agent', 'compact'])
  expect(stub.logs.some(l => l.to === 'debug' && l.text.includes('report-agent exited 1'))).toBe(true)
})

test('a turn starting while pinned hands the pane back at once and only once', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, HERDR_ENV, { screen: ['working'] })

  await runCompaction($, clock)
  await $.turn.start({ text: 'back', turnId: 't2' })
  await clock.settle()
  expect(reportCalls(stub).slice(-2)).toEqual(['release-agent', 'report-agent-session'])

  await clock.advance(SETTLE_LIMIT)
  expect(stub.events.filter(e => e === 'release-agent').length).toBe(1)
})

test('uses HERDR_BIN_PATH when herdr provides it', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { ...HERDR_ENV, HERDR_BIN_PATH: '/opt/herdr/bin/herdr' })

  await runCompaction($, clock)
  await clock.advance(SETTLE_MARGIN)

  expect(stub.argvs.length).toBe(4)
  expect(stub.argvs.every(argv => argv[0] === '/opt/herdr/bin/herdr')).toBe(true)
})
