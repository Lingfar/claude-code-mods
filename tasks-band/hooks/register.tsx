import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TaskKind, TaskRow, TrackedTask, TrackedTasks } from '../types'

import { describedTask, endedTaskIds, formatElapsed, KIND_TITLES, rowsOf, taskCounts, trackedFrom } from './tasks'

const tasks = atom({ plugin: 'tasks-band', key: 'tasks' } as const, {})
const agents = atom({ plugin: 'tasks-band', key: 'agents' } as const, [])
const expanded = atom({ plugin: 'tasks-band', key: 'expanded' } as const, null)
const now = atom({ plugin: 'tasks-band', key: 'now' } as const, 0)

const LIVE_AGENT_STATUSES = new Set(['pending', 'running', 'waiting'])
const CARD_TINT = 'rgba(128, 128, 128, 0.12)'

async function refreshAgents($: EngineInterface): Promise<void> {
  const [list, previous, nowMs] = await Promise.all([$.agent.list(), read($, agents), $.clock.now()])
  const startedAt = new Map(previous.map(row => [row.id, row.startedAt]))

  const running: TaskRow[] = list
    .filter(agent => LIVE_AGENT_STATUSES.has(agent.status))
    .map(agent => ({ id: agent.id, label: agent.description || agent.name || agent.type, detail: agent.type, startedAt: startedAt.get(agent.id) ?? nowMs }))

  if (JSON.stringify(running) !== JSON.stringify(previous)) {
    await update($, agents, () => running)
  }
}

async function refreshNow($: EngineInterface): Promise<void> {
  const nowMs = await $.clock.now()

  await update($, now, () => nowMs)
}

async function tick($: EngineInterface): Promise<void> {
  if ((await read($, expanded)) !== null) {
    await refreshNow($)
  }
}

async function storeTasks($: EngineInterface, change: (current: TrackedTasks) => TrackedTasks): Promise<void> {
  const current = await read($, tasks)
  const changed = change(current)

  if (JSON.stringify(changed) !== JSON.stringify(current)) {
    await update($, tasks, () => changed)
  }
}

async function trackTask($: EngineInterface, id: string | undefined, describe: (startedAt: number) => TrackedTask): Promise<void> {
  if (id === undefined) {
    return
  }

  const startedAt = await $.clock.now()

  await storeTasks($, current => ({ ...current, [id]: describe(startedAt) }))
  await update($, now, () => startedAt)
}

function untrackTasks($: EngineInterface, ids: readonly string[]): Promise<void> {
  return storeTasks($, current => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))))
}

async function toggle($: EngineInterface, kind: TaskKind): Promise<void> {
  await refreshNow($)
  await update($, expanded, current => (current === kind ? null : kind))
}

async function stopTask($: EngineInterface, id: string): Promise<void> {
  const stopped = await $.tool.call({ tool: 'TaskStop', task_id: id })

  if (stopped.deny !== undefined || stopped.isError === true) {
    $.ui.toast(`Arrêt impossible : ${stopped.deny ?? stopped.text ?? id}`)

    return
  }

  await untrackTasks($, [id])
  await refreshAgents($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refreshAgents($)

    $.clock.every(3_000, () => {
      refreshAgents($).catch(() => undefined)
    })
    $.clock.every(5_000, () => {
      tick($).catch(() => undefined)
    })

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await trackTask($, ran.result.backgroundTaskId, startedAt => describedTask('shell', e.description, e.command, 'shell', startedAt))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await trackTask($, ran.result.taskId, startedAt => describedTask('monitor', e.description, e.command, 'monitor', startedAt))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      const { workflowName } = ran.result

      await trackTask($, ran.result.taskId, startedAt => describedTask('workflow', workflowName, undefined, 'workflow', startedAt))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await untrackTasks($, [ran.result.task_id])
      await refreshAgents($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    await refreshAgents($)

    return spawned
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      await untrackTasks($, endedTaskIds(e.text))
      await refreshAgents($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    const answered = await next(e)
    const summaries = e.background_tasks

    if (summaries !== undefined) {
      const nowMs = await $.clock.now()

      await storeTasks($, current => trackedFrom(summaries, current, nowMs))
    }

    await refreshAgents($)

    return answered
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [tracked, running, picked, nowMs] = await Promise.all([read($, tasks), read($, agents), read($, expanded), read($, now)])
    const counts = taskCounts(tracked, running)

    if (e.props.hasSurvey || counts.length === 0) {
      return next(e)
    }

    const open = counts.some(count => count.kind === picked) ? picked : null
    const { Box, Button, Text } = $.ui.resolve(e)

    const isDesktop = e.surface === 'desktop'

    const items = counts.map(count => (
      <Button key={count.kind} plain onPress={() => toggle($, count.kind)}>
        <Text bold={open === count.kind} hover={{ underline: true }}>{`${count.count} ${count.label}`}</Text>
        <Text dimColor>{open === count.kind ? ' ▾' : ' ▸'}</Text>
      </Button>
    ))

    const children = [
      <Box key="bar" flexDirection="row" columnGap={3}>
        <Text dimColor>Running</Text>
        {items}
      </Box>,
    ]

    if (open !== null) {
      for (const row of rowsOf(open, tracked, running)) {
        children.push(
          <Box
            key={`row-${row.id}`}
            width="100%"
            flexDirection="row"
            justifyContent="space-between"
            columnGap={2}
            paddingX={1}
            borderStyle="round"
            borderColor={isDesktop ? CARD_TINT : 'inactive'}
            backgroundColor={isDesktop ? CARD_TINT : undefined}
          >
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Text wrap="truncate-end">{row.label}</Text>
              <Text dimColor wrap="truncate-end">
                {`${KIND_TITLES[open]}   ${formatElapsed(nowMs - row.startedAt)}`}
                {row.detail === undefined ? '' : `   ${row.detail}`}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Button key={`stop-${row.id}`} label="▢" onPress={() => stopTask($, row.id)} />
            </Box>
          </Box>,
        )
      }
    }

    return (
      <Box key="tasks" width="100%" flexDirection="column" rowGap={isDesktop ? 1 : 0}>
        {children}
      </Box>
    )
  })
}
