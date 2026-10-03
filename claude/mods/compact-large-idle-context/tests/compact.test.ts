import type { ModelUsage, On, SessionCompactResult, SessionMessage, TurnCompleteInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const MINUTE = 60 * 1000
const DELAY = 50 * MINUTE

type Stub = {
  logs: { text: string; to: string }[]
  compactCalls: (string | undefined)[]
  tokens: number | undefined
  sessionId: string
  compact: () => SessionCompactResult
  onUsage?: () => Promise<unknown>
  onCompact?: () => Promise<unknown>
  onLog?: (text: string) => void
}

const MESSAGES: SessionMessage[] = [{ role: 'user', text: 'summary', toolUses: [] }]

const USAGE: ModelUsage = {
  input_tokens: 1_000,
  output_tokens: 4_000,
  cache_read_input_tokens: 180_000,
  cache_creation_input_tokens: 19_000,
}

const stubEngine = (on: On, overrides: Partial<Stub> = {}): Stub => {
  const stub: Stub = {
    logs: [],
    compactCalls: [],
    tokens: 250_000,
    sessionId: 'session-1',
    compact: () => ({ messages: MESSAGES, tokensBefore: 250_000, tokensAfter: 20_000, usage: USAGE }),
    ...overrides,
  }
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: stub.sessionId }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.usage', async () => {
    await stub.onUsage?.()
    return { value: { startedAt: 0, context: { tokens: stub.tokens, window: 1_000_000 }, rateLimits: [] } }
  })
  on('session.compact', async ($, e) => {
    stub.compactCalls.push(e.trigger)
    if (e.trigger === undefined || e.trigger === 'plugin') await stub.onCompact?.()
    return stub.compact()
  })
  on('ui.log', ($, e) => {
    stub.logs.push({ text: e.text, to: e.to })
    stub.onLog?.(e.text)
    return { value: undefined }
  })
  return stub
}

const answered = (overrides: Partial<TurnCompleteInput> = {}): TurnCompleteInput =>
  ({
    answer: 'done',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...overrides,
  }) as TurnCompleteInput

const transcript = (stub: Stub) => stub.logs.filter(l => l.to !== 'debug').map(l => l.text)
const reservations = (stub: Stub) => stub.logs.filter(l => l.to === 'debug' && l.text.includes('reserved')).length
const TEST_TRIGGERS: (string | undefined)[] = ['manual', 'auto', 'precompute']
const idleCompacts = (stub: Stub) => stub.compactCalls.filter(t => !TEST_TRIGGERS.includes(t)).length

test('does nothing at 49:59 and compacts exactly once at 50:00', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  expect(reservations(stub)).toBe(1)

  await clock.advance(DELAY - 1000)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(0)

  await clock.advance(1000)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(1)

  await clock.advance(5 * DELAY)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(1)
  expect(reservations(stub)).toBe(1)
})

test('shows one line with the token count and the cache hit breakdown', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()

  expect(transcript(stub)).toEqual([
    'Compacted idle context of 250,000 tokens; summary cache hit 90.0% (read 180,000 / write 19,000 / uncached 1,000)',
  ])
})

test('omits the hit rate when the compaction reports no usage', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { compact: () => ({ messages: MESSAGES, tokensBefore: 321_000 }) })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()

  expect(transcript(stub)).toEqual(['Compacted idle context of 321,000 tokens'])
})

const lateClock = (on: On, stub: Stub) => {
  let now = 0
  const timers: (() => void)[] = []
  on('clock.now', () => ({ value: now }))
  on('clock.after', () => new Promise(resolve => timers.push(() => resolve({ value: undefined }))))
  return {
    wakeAfter: (ms: number, until: (text: string) => boolean) =>
      new Promise<void>(resolve => {
        stub.onLog = text => {
          if (until(text)) resolve()
        }
        now += ms
        for (const release of timers.splice(0)) release()
      }),
  }
}

test('does nothing when the timer fires before 50 minutes', async ($, on) => {
  const stub = stubEngine(on)
  const clock = lateClock(on, stub)

  await $.turn.complete(answered())
  await clock.wakeAfter(DELAY - 1000, text => text.includes('skipped'))

  expect(idleCompacts(stub)).toBe(0)
  expect(stub.logs.some(l => l.to === 'debug' && l.text.includes('49:59 since the turn ended'))).toBe(true)
})

test('does nothing when the timer fires 58 minutes or more after the turn', async ($, on) => {
  const stub = stubEngine(on)
  const clock = lateClock(on, stub)

  await $.turn.complete(answered())
  await clock.wakeAfter(58 * MINUTE, text => text.includes('skipped'))

  expect(idleCompacts(stub)).toBe(0)
  expect(transcript(stub)).toEqual([])
  expect(stub.logs.some(l => l.to === 'debug' && l.text.includes('58:00 since the turn ended'))).toBe(true)
})

test('still compacts when the timer fires at 57:59', async ($, on) => {
  const stub = stubEngine(on)
  const clock = lateClock(on, stub)

  await $.turn.complete(answered())
  await clock.wakeAfter(58 * MINUTE - 1000, text => text.startsWith('Compacted'))

  expect(idleCompacts(stub)).toBe(1)
})

test('does nothing below 200,000 tokens and does not retry', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { tokens: 199_999 })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()
  stub.tokens = 300_000
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(0)
  expect(transcript(stub)).toEqual([])
})

test('compacts at exactly 200,000 tokens', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { tokens: 200_000 })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
})

test('does nothing when the session changed since the reservation', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  stub.sessionId = 'session-2'
  await clock.advance(DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(0)
})

test('a new turn cancels the reservation', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(10 * MINUTE)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(0)
})

test('each completed turn restarts the 50 minutes and keeps one reservation', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(30 * MINUTE)
  await $.turn.complete(answered({ turnId: 't2' }))
  await clock.advance(30 * MINUTE)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(0)

  await clock.advance(20 * MINUTE)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(1)

  await clock.advance(5 * DELAY)
  await clock.settle()
  expect(idleCompacts(stub)).toBe(1)
})

for (const trigger of ['manual', 'auto'] as const) {
  test(`a ${trigger} compaction cancels the reservation`, async ($, on) => {
    const clock = mock.clock(on)
    const stub = stubEngine(on)

    await $.turn.complete(answered())
    await $.session.compact({ trigger, messages: MESSAGES })
    await clock.advance(5 * DELAY)
    await clock.settle()

    expect(idleCompacts(stub)).toBe(0)
  })
}

test('a precompute does not cancel the reservation', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await $.session.compact({ trigger: 'precompute', messages: MESSAGES })
  await clock.advance(DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
})

test('a subagent compaction does not cancel the reservation', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await $.session.compact({ trigger: 'auto', agentId: 'sub', messages: MESSAGES })
  await clock.advance(DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
})

for (const reason of ['prompt_input_exit', 'clear', 'resume', 'logout', 'other'] as const) {
  test(`the session ending (${reason}) cancels the reservation`, async ($, on) => {
    const clock = mock.clock(on)
    const stub = stubEngine(on)

    await $.turn.complete(answered())
    await $.session.end({ reason, sessionId: 'session-1', resume: { id: 'session-1' } })
    await clock.advance(5 * DELAY)
    await clock.settle()

    expect(idleCompacts(stub)).toBe(0)
  })
}

const unreserved: [string, Partial<TurnCompleteInput>][] = [
  ['a subagent turn', { agentId: 'sub' }],
  ['an interrupted turn', { reason: 'aborted', isAborted: true }],
  ['a turn ended by an error', { reason: 'error' }],
  ['a refused turn', { reason: 'refusal', refusal: { category: null, explanation: null } }],
]

for (const [name, overrides] of unreserved) {
  test(`${name} does not reserve`, async ($, on) => {
    const clock = mock.clock(on)
    const stub = stubEngine(on)

    await $.turn.complete(answered(overrides))
    await clock.advance(5 * DELAY)
    await clock.settle()

    expect(reservations(stub)).toBe(0)
    expect(idleCompacts(stub)).toBe(0)
  })
}

test('an interrupted turn after an answered one leaves nothing reserved', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await $.turn.start({ text: 'more', turnId: 't2' })
  await $.turn.complete(answered({ turnId: 't2', reason: 'aborted', isAborted: true }))
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(0)
})

test('a turn starting during the check stops the compaction', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { onUsage: () => $.turn.start({ text: 'back', turnId: 't2' }) })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(0)
  expect(stub.logs.some(l => l.to === 'debug' && l.text.includes('a turn started during the check'))).toBe(true)
})

test('a failed compaction is not retried', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, {
    compact: () => {
      throw new Error('a turn is running')
    },
  })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
  expect(reservations(stub)).toBe(1)
  expect(transcript(stub)).toEqual([])
  expect(stub.logs.some(l => l.to === 'debug' && l.text.includes('compaction failed'))).toBe(true)
})

test('a vetoed compaction is not retried and shows nothing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { compact: () => ({ skip: 'blocked by PreCompact' }) })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
  expect(transcript(stub)).toEqual([])
})

test('turns completing during the compaction do not reserve again', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, {
    onCompact: async () => {
      await $.turn.complete(answered({ turnId: 'summary' }))
      await $.turn.complete(answered({ turnId: 'summary-fork', agentId: 'compact-fork' }))
    },
  })

  await $.turn.complete(answered())
  await clock.advance(DELAY)
  await clock.settle()
  await clock.advance(5 * DELAY)
  await clock.settle()

  expect(idleCompacts(stub)).toBe(1)
  expect(reservations(stub)).toBe(1)
})
