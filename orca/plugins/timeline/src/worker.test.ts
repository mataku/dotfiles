import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, beforeEach, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const TERMINAL = 'term_a'
const tasks = [{ id: '1', title: 'Research', status: 'done', share: 1, children: [] }]
const plan = { title: 'Ship', percent: 100, done: 1, total: 1, tasks }
const body = (terminal: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, terminal, agent: 'claude', updatedAt: 5, plan, ...over })

let home = ''
let realHome: string | undefined

beforeEach(async () => {
  realHome = process.env.HOME
  home = await mkdtemp(join(tmpdir(), 'orca-timeline-'))
  process.env.HOME = home
  await mkdir(join(home, '.local/state/agent-timeline'), { recursive: true })
})

afterEach(async () => {
  process.env.HOME = realHome
  await rm(home, { recursive: true, force: true })
})

const write = (terminal: string, text: string) => writeFile(join(home, '.local/state/agent-timeline', `${terminal}.json`), text)

test('answers the plans of the terminals asked for, in their order', async () => {
  await write(TERMINAL, body(TERMINAL))
  await write('term_b', body('term_b', { plan: null }))
  await write('term_c', body('term_c'))
  const worker = await mountWorker(main)
  const answer = await worker.request('plans.list', { terminals: ['term_c', 'term_b', 'term_missing', '../x', TERMINAL] })
  assert.deepEqual(answer.plans.map((p) => p.terminal), ['term_c', TERMINAL])
  assert.deepEqual(answer.plans[1], { terminal: TERMINAL, agent: 'claude', updatedAt: 5, plan })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('keeps the last plan while its file is cut short by a write under way', async () => {
  await write(TERMINAL, body(TERMINAL))
  const worker = await mountWorker(main)
  await worker.request('plans.list', { terminals: [TERMINAL] })
  await write(TERMINAL, body(TERMINAL).slice(0, 30))
  const answer = await worker.request('plans.list', { terminals: [TERMINAL] })
  assert.deepEqual(answer.plans.map((p) => p.plan.title), ['Ship'])
  await worker.deactivate()
})
