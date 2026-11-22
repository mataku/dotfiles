import type { PlanEntry } from './plan'

declare module 'orca' {
  interface PluginRequests {
    'plans.list': { input: { terminals: string[] }; output: { plans: PlanEntry[] } }
  }
  interface PluginPanelEvents {
    'plans.changed': Record<string, never>
  }
}
