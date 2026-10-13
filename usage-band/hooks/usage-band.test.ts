import { expect, mock, test } from 'claude-code/testing'

import { formatCountdown, ringGlyph, snapshotOf } from './format'

const PROPS = { modes: ['focus'] }

const NOW = Date.parse('2026-10-12T10:00:00Z')

test('formats countdowns', async () => {
  expect(formatCountdown('2026-10-12T12:13:00Z', NOW)).toBe('2h13')
  expect(formatCountdown('2026-10-12T10:42:00Z', NOW)).toBe('42min')
  expect(formatCountdown('2026-10-15T15:00:00Z', NOW)).toBe('3j')
  expect(formatCountdown('2026-10-13T09:59:00Z', NOW)).toBe('23h59')
  expect(formatCountdown('2026-10-12T18:00:00Z', NOW)).toBe('8h00')
  expect(formatCountdown(undefined, NOW)).toBeUndefined()
})

test('shows nothing until the first limit reading', async () => {
  expect(snapshotOf({ rateLimits: [] })).toBeNull()
})

test('picks a ring glyph per quarter', async () => {
  expect([0, 3, 23, 50, 91, 99, 100].map(ringGlyph)).toEqual(['○', '◔', '◔', '◑', '◕', '◕', '●'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws plan limits in the prompt footer on ${surface}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    on('session.measure', ($, e) => ({ changed: e.changed }))

    await $.session.measure({
      context: { tokens: 84_200, window: 200_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-12T12:13:00Z' },
        { kind: 'seven_day', percentUsed: 91, resetsAt: '2026-10-15T15:00:00Z' },
      ],
      changed: ['context', 'rateLimits'],
    })

    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'SessionMode', props: PROPS })

    const drawn = JSON.stringify(await ui.drawn())

    expect(drawn).toContain('◔')

    for (const text of ['5h', '23%', '↻2h13', '7j', '91%', '↻3j', 'focus']) {
      expect(drawn).toContain(text)
    }
  })
}
