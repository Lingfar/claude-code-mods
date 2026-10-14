import { expect, mock, test } from 'claude-code/testing'

import { endedTaskIds, formatElapsed, rowsOf, taskCounts, trackedFrom } from './tasks'

const BAND_PROPS = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} }

const NOW = Date.parse('2026-10-13T10:00:00Z')

const AGENT_ROW = { id: 'a1', label: 'explore the repo', detail: 'Explore', startedAt: NOW }

const NOTIFICATIONS = [
  '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>',
  '<task-notification>\n<task-id>m1</task-id>\n<summary>new line</summary>\n</task-notification>',
].join('\n')

test('counts tasks by kind with running agents', async () => {
  const tracked = {
    b1: { kind: 'shell', label: 'tests', startedAt: NOW },
    b2: { kind: 'shell', label: 'dev server', startedAt: NOW },
    m1: { kind: 'monitor', label: 'logs', startedAt: NOW },
  } as const

  expect(taskCounts(tracked, [AGENT_ROW])).toEqual([
    { kind: 'shell', count: 2, label: 'shells' },
    { kind: 'agent', count: 1, label: 'agent' },
    { kind: 'monitor', count: 1, label: 'monitor' },
  ])
  expect(taskCounts({}, [])).toEqual([])
})

test('reads only ended tasks from notifications', async () => {
  expect(endedTaskIds(NOTIFICATIONS)).toEqual(['b1'])
})

test('keeps in-flight tasks from the Stop summary, their start times and no agents', async () => {
  const summaries = [
    { id: 'b1', type: 'shell', description: 'Run tests', command: 'npm test' },
    { id: 'a1', type: 'subagent', description: 'explore', agent_type: 'Explore' },
    { id: 'w1', type: 'workflow', description: 'review', name: 'review' },
    { id: 'x1', type: 'MCP task', description: '' },
  ]
  const previous = { b1: { kind: 'shell', label: 'Run tests', detail: 'npm test', startedAt: NOW - 60_000 } } as const

  expect(trackedFrom(summaries, previous, NOW)).toEqual({
    b1: { kind: 'shell', label: 'Run tests', detail: 'npm test', startedAt: NOW - 60_000 },
    w1: { kind: 'workflow', label: 'review', startedAt: NOW },
    x1: { kind: 'other', label: 'x1', startedAt: NOW },
  })
})

test('lists the rows of one kind, oldest first', async () => {
  const tracked = {
    b2: { kind: 'shell', label: 'npm run dev', startedAt: NOW },
    b1: { kind: 'shell', label: 'Run tests', detail: 'npm test', startedAt: NOW - 5_000 },
    m1: { kind: 'monitor', label: 'logs', startedAt: NOW },
  } as const

  expect(rowsOf('shell', tracked, [AGENT_ROW])).toEqual([
    { id: 'b1', label: 'Run tests', detail: 'npm test', startedAt: NOW - 5_000 },
    { id: 'b2', label: 'npm run dev', startedAt: NOW },
  ])
  expect(rowsOf('agent', tracked, [AGENT_ROW])).toEqual([AGENT_ROW])
})

test('formats elapsed time', async () => {
  expect([0, 12_400, 72_000, 3_600_000 + 5 * 60_000].map(formatElapsed)).toEqual(['0s', '12s', '1m 12s', '1h 05m'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws a task bar whose items unfold stoppable rows on ${surface}`, async ($, on) => {
    let shellCount = 0
    const stopped: string[] = []

    const clock = mock.clock(on, { now: NOW })

    on('agent.list', () => ({
      value: [
        { id: 'a1', description: 'explore the repo', type: 'Explore', status: 'running' },
        { id: 'a2', description: 'review', type: 'Explore', status: 'completed' },
      ],
    }))
    on('tool.call', { tool: 'Bash' }, () => {
      shellCount += 1

      return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `b${shellCount}` } }
    })
    on('tool.call', { tool: 'TaskStop' }, ($, e) => {
      stopped.push(e.task_id ?? '')

      return { result: { message: 'stopped', task_id: e.task_id ?? '', task_type: 'local_bash' } }
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('classic.Stop', () => ({}))

    await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run tests', run_in_background: true })
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })

    const ui = await $.ui.mount({ plugin: 'tasks-band', surface, component: 'AbovePrompt', props: BAND_PROPS })

    const collapsed = JSON.stringify(await ui.drawn())

    expect(collapsed).toContain('shells')
    expect(collapsed).toContain('Running')
    expect(await ui.find({ key: 'row-b1' })).toBeUndefined()

    await ui.press({ key: 'shell' })

    const shellsOpen = JSON.stringify(await ui.drawn())

    expect(await ui.find({ key: 'row-b1' })).toBeDefined()

    for (const text of ['Running', 'Run tests', 'Bash', 'npm test', 'npm run dev', '▾', '0s', '▢']) {
      expect(shellsOpen).toContain(text)
    }

    await ui.press({ key: 'stop-b2' })

    expect(stopped).toEqual(['b2'])
    expect(shellsOpen).not.toContain('Arrêter')
    expect(await ui.find({ key: 'row-b2' })).toBeUndefined()

    await clock.advance(72_000)
    await $.prompt.submit({ text: NOTIFICATIONS, origin: { kind: 'task-notification' }, wait: false })
    await ui.press({ key: 'agent' })

    const agentsOpen = JSON.stringify(await ui.drawn())

    expect(agentsOpen).toContain('Agent')
    expect(agentsOpen).toContain('explore the repo')
    expect(agentsOpen).not.toContain('Run tests')
    expect(agentsOpen).not.toContain('review')

    await ui.press({ key: 'agent' })

    expect(await ui.find({ key: 'row-a1' })).toBeUndefined()

    await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })

    const afterStop = JSON.stringify(await ui.drawn())

    expect(afterStop).not.toContain('shell')
    expect(afterStop).toContain('agent')
  })
}

test('drops a shell whose end is delivered into a running turn, and a card whose task is already gone', async ($, on) => {
  let shellCount = 0

  mock.clock(on, { now: NOW })
  on('agent.list', () => ({ value: [] }))
  on('tool.call', { tool: 'Bash' }, () => {
    shellCount += 1

    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `b${shellCount}` } }
  })
  on('tool.call', { tool: 'TaskStop' }, ($, e) => ({ isError: true, result: `No task found with ID: ${e.task_id ?? ''}` }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })

  const ui = await $.ui.mount({ plugin: 'tasks-band', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS })

  await ui.press({ key: 'shell' })
  await $.prompt.attachment({ type: 'queued_command', text: NOTIFICATIONS, origin: { kind: 'engine' } })

  expect(await ui.find({ key: 'row-b1' })).toBeUndefined()
  expect(await ui.find({ key: 'row-b2' })).toBeDefined()

  await ui.press({ key: 'stop-b2' })

  expect(JSON.stringify(await ui.drawn())).not.toContain('shell')
})
