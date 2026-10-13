export type TaskKind = 'shell' | 'agent' | 'monitor' | 'workflow' | 'other'

export type TaskRow = { id: string; label: string; detail?: string; startedAt: number }

export type TrackedTask = { kind: TaskKind; label: string; detail?: string; startedAt: number }

export type TrackedTasks = Record<string, TrackedTask>

declare module 'claude-code' {
  interface PluginState {
    'tasks-band': { tasks: TrackedTasks; agents: TaskRow[]; expanded: TaskKind | null; now: number }
  }
}
