import type { ModelUsage, On, SessionCompactResult, SessionMessage, TurnCompleteInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const MINUTE = 60 * 1000
const IDLE = 30 * MINUTE

type Stub = {
  logs: { text: string; to: string }[]
  compact: () => SessionCompactResult
  failLog: boolean
}

const MESSAGES: SessionMessage[] = [{ role: 'user', text: 'summary', toolUses: [] }]

const USAGE: ModelUsage = {
  input_tokens: 1_000,
  output_tokens: 4_000,
  cache_read_input_tokens: 180_000,
  cache_creation_input_tokens: 19_000,
}

const COMPACTED: SessionCompactResult = { messages: MESSAGES, tokensBefore: 250_000, tokensAfter: 20_000, usage: USAGE }

const stubEngine = (on: On, overrides: Partial<Stub> = {}): Stub => {
  const stub: Stub = { logs: [], compact: () => COMPACTED, failLog: false, ...overrides }
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.compact', () => stub.compact())
  on('ui.log', ($, e) => {
    if (stub.failLog) throw new Error('log failed')
    stub.logs.push({ text: e.text, to: e.to })
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
const debugLines = (stub: Stub) => stub.logs.filter(l => l.to === 'debug').map(l => l.text)

const LINE =
  'Compacted idle context of 250,000 tokens; summary cache hit 90.0% (read 180,000 / write 19,000 / uncached 1,000)'

test('an automatic compaction after a long idle shows the token count and the cache hit breakdown', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  const result = await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(result).toEqual(COMPACTED)
  expect(transcript(stub)).toEqual([LINE])
})

test('counts from exactly 30 minutes after the turn', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(IDLE - 1)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })
  expect(transcript(stub)).toEqual([])

  await clock.advance(1)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })
  expect(transcript(stub)).toEqual([LINE])
})

test('omits the hit rate when the compaction reports no usage', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { compact: () => ({ messages: MESSAGES, tokensBefore: 321_000 }) })

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(transcript(stub)).toEqual(['Compacted idle context of 321,000 tokens'])
})

test('an automatic compaction right after a turn shows nothing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(5 * 1000)
  const result = await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(result).toEqual(COMPACTED)
  expect(transcript(stub)).toEqual([])
})

test('an automatic compaction during a long turn shows nothing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.start({ text: 'long task', turnId: 't1' })
  await clock.advance(2 * 60 * MINUTE)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(transcript(stub)).toEqual([])
})

test('an automatic compaction before any turn shows nothing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await clock.advance(2 * 60 * MINUTE)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(transcript(stub)).toEqual([])
})

test('a subagent turn ending does not restart the idle time', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(40 * MINUTE)
  await $.turn.complete(answered({ turnId: 'sub-1', agentId: 'sub' }))
  await clock.advance(14 * MINUTE)
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(transcript(stub)).toEqual([LINE])
})

for (const trigger of ['manual', 'plugin', 'precompute'] as const) {
  test(`a ${trigger} compaction after a long idle passes through and shows nothing`, async ($, on) => {
    const clock = mock.clock(on)
    const stub = stubEngine(on)

    await $.turn.complete(answered())
    await clock.advance(54 * MINUTE)
    const result = await $.session.compact({ trigger, messages: MESSAGES })

    expect(result).toEqual(COMPACTED)
    expect(transcript(stub)).toEqual([])
  })
}

test("a subagent's automatic compaction shows nothing and is not logged", async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  await $.session.compact({ trigger: 'auto', agentId: 'sub', messages: MESSAGES })

  expect(stub.logs).toEqual([])
})

test('a compaction core skips passes the skip through and shows nothing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on, { compact: () => ({ skip: 'blocked by PreCompact' }) })

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  const result = await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(result).toEqual({ skip: 'blocked by PreCompact' })
  expect(transcript(stub)).toEqual([])
})

test('a compaction core fails on still fails', async ($, on) => {
  const clock = mock.clock(on)
  stubEngine(on, {
    compact: () => {
      throw new Error('summary failed')
    },
  })

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)

  await expect($.session.compact({ trigger: 'auto', messages: MESSAGES })).rejects.toThrow()
})

test('a failing log does not fail the compaction', async ($, on) => {
  const clock = mock.clock(on)
  stubEngine(on, { failLog: true })

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  const result = await $.session.compact({ trigger: 'auto', messages: MESSAGES })

  expect(result).toEqual(COMPACTED)
})

test('every main-conversation compaction leaves a debug line with its trigger and timing', async ($, on) => {
  const clock = mock.clock(on)
  const stub = stubEngine(on)

  await $.turn.complete(answered())
  await clock.advance(54 * MINUTE)
  await $.session.compact({ trigger: 'manual', messages: MESSAGES })

  expect(debugLines(stub)).toEqual(['compact-large-idle-context: manual compaction, no turn running, 54:00 since the last turn'])
})
