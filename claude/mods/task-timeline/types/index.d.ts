export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked'

export type Task = {
  id: string
  title: string
  weight: number
  status: TaskStatus
  note?: string
  children: Task[]
}

export type Plan = {
  title: string
  tasks: Task[]
}

export type TaskInput = {
  id?: string
  title: string
  weight?: number
  status?: TaskStatus
  note?: string
  children?: TaskInput[]
}

export type TaskUpdate = {
  id: string
  status?: TaskStatus
  note?: string
  title?: string
}

export type TaskAddition = {
  parent?: string
  tasks: TaskInput[]
}

declare module 'claude-code' {
  interface PluginState {
    'task-timeline': { plan: Plan | null; isDismissed: boolean }
  }
  interface McpToolInputs {
    'mcp__task-timeline__plan_set': { title: string; tasks: TaskInput[] }
    'mcp__task-timeline__plan_update': { updates?: TaskUpdate[]; add?: TaskAddition[] }
  }
}
