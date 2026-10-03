export type JobKind = 'agent' | 'shell'

export type JobOutcome = 'ok' | 'fail'

export type Job = {
  id: string
  kind: JobKind
  label: string
  description: string
  startedAt: number
  toolCalls: number
  lastTool?: string
  toolUseId?: string
  endedAt?: number
  outcome?: JobOutcome
  detail?: string
}

declare module 'claude-code' {
  interface PluginState {
    'background-jobs-band': { jobs: Job[]; foreground: string[]; tick: number }
  }
}
