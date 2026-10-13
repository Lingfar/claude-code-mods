import type { TaskKind, TaskRow, TrackedTask, TrackedTasks } from '../types'

export type TaskCount = { kind: TaskKind; count: number; label: string }

export type TaskSummary = { id: string; type: string; description: string; command?: string }

const KIND_ORDER: TaskKind[] = ['shell', 'agent', 'monitor', 'workflow', 'other']

const KIND_LABELS: Record<TaskKind, [string, string]> = {
  shell: ['shell', 'shells'],
  agent: ['agent', 'agents'],
  monitor: ['monitor', 'monitors'],
  workflow: ['workflow', 'workflows'],
  other: ['task', 'tasks'],
}

export const KIND_TITLES: Record<TaskKind, string> = {
  shell: 'Bash',
  agent: 'Agent',
  monitor: 'Monitor',
  workflow: 'Workflow',
  other: 'Task',
}

const ENDED_STATUSES = new Set(['completed', 'failed', 'killed'])

export function kindOf(summaryType: string): TaskKind | undefined {
  if (summaryType === 'shell' || summaryType === 'monitor' || summaryType === 'workflow') {
    return summaryType
  }

  return /agent|teammate/i.test(summaryType) ? undefined : 'other'
}

export function describedTask(kind: TaskKind, description: string | undefined, command: string | undefined, fallback: string, startedAt: number): TrackedTask {
  const label = description?.trim() || command?.trim() || fallback

  return label === command?.trim() || command === undefined ? { kind, label, startedAt } : { kind, label, detail: command, startedAt }
}

export function trackedFrom(summaries: readonly TaskSummary[], previous: TrackedTasks, nowMs: number): TrackedTasks {
  const tracked: TrackedTasks = {}

  for (const summary of summaries) {
    const kind = kindOf(summary.type)

    if (kind !== undefined) {
      tracked[summary.id] = describedTask(kind, summary.description, summary.command, summary.id, previous[summary.id]?.startedAt ?? nowMs)
    }
  }

  return tracked
}

export function endedTaskIds(notificationText: string): string[] {
  return notificationText
    .split('<task-notification>')
    .map(block => ({ id: /<task-id>([^<]+)<\/task-id>/.exec(block)?.[1], status: /<status>([^<]+)<\/status>/.exec(block)?.[1] }))
    .filter(({ id, status }) => id !== undefined && status !== undefined && ENDED_STATUSES.has(status.trim()))
    .map(({ id }) => (id ?? '').trim())
}

export function taskCounts(tracked: TrackedTasks, runningAgents: readonly TaskRow[]): TaskCount[] {
  const counts: Record<TaskKind, number> = { shell: 0, agent: runningAgents.length, monitor: 0, workflow: 0, other: 0 }

  for (const task of Object.values(tracked)) {
    counts[task.kind] += 1
  }

  return KIND_ORDER.filter(kind => counts[kind] > 0).map(kind => ({
    kind,
    count: counts[kind],
    label: KIND_LABELS[kind][counts[kind] === 1 ? 0 : 1],
  }))
}

export function rowsOf(kind: TaskKind, tracked: TrackedTasks, runningAgents: readonly TaskRow[]): TaskRow[] {
  const rows =
    kind === 'agent'
      ? [...runningAgents]
      : Object.entries(tracked)
          .filter(([, task]) => task.kind === kind)
          .map(([id, { kind: _kind, ...row }]) => ({ id, ...row }))

  return rows.sort((left, right) => left.startedAt - right.startedAt)
}

export function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`
}
