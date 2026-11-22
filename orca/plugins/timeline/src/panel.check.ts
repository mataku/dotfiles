import { defineCheck } from 'orca/testing'
import type { PlanEntry } from './plan'

const entry = (terminal: string, title: string, percent: number): PlanEntry => ({
  terminal,
  agent: 'claude',
  updatedAt: 5,
  plan: {
    title,
    percent,
    done: 1,
    total: 4,
    tasks: [
      { id: '1', title: 'Research', status: 'done', share: 0.25, children: [] },
      {
        id: '2',
        title: 'Build',
        status: 'in_progress',
        share: 0.5,
        note: 'half way',
        children: [
          { id: '2.1', title: 'Tree', status: 'in_progress', share: 0.25, children: [] },
          { id: '2.2', title: 'Bar', status: 'blocked', share: 0.25, note: 'needs a token', children: [] }
        ]
      },
      { id: '3', title: 'CI', status: 'pending', share: 0.25, children: [] }
    ]
  }
})

const workspace = (terminals: { id: string; title?: string }[]) =>
  ({ event: 'workspace.changed', payload: { context: { workspaceId: 'w1', branch: 'main', displayName: 'app', terminals } } }) as const

export default defineCheck({
  empty: { requests: { 'plans.list': () => ({ plans: [] }) } },
  one: {
    requests: { 'plans.list': () => ({ plans: [entry('term_a', 'Ship timeline', 25)] }) },
    events: [workspace([{ id: 'term_a', title: 'claude' }])]
  },
  several: {
    requests: { 'plans.list': () => ({ plans: [entry('term_a', 'Ship timeline', 25), entry('term_b', 'Fix login', 60)] }) },
    events: [workspace([{ id: 'term_a', title: 'api' }, { id: 'term_b', title: 'web' }])]
  },
  chat: {
    results: { 'agents.list': { agents: [{ terminalId: null, title: null, agent: 'claude', state: 'working', stateStartedAt: 1, sessionId: 'session-1' }] } },
    requests: { 'plans.list': () => ({ plans: [entry('session-1', 'Chat plan', 25)] }) },
    events: [workspace([])]
  }
})
