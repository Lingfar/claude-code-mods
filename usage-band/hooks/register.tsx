import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageSnapshot } from '../types'

import { gaugesOf, ringGlyph, snapshotOf } from './format'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const PERCENT_COLORS = { normal: undefined, warning: 'warning', error: 'error' } as const
const RING_COLORS = { normal: 'success', warning: 'warning', error: 'error' } as const
const SEPARATOR = ' │ '

async function refreshNow($: EngineInterface): Promise<void> {
  const nowMs = await $.clock.now()

  await update($, now, () => nowMs)
}

async function storeUsage($: EngineInterface, latest: UsageSnapshot | null): Promise<void> {
  if (latest === null || JSON.stringify(await read($, usage)) === JSON.stringify(latest)) {
    return
  }

  await update($, usage, () => latest)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await storeUsage($, snapshotOf(await $.session.usage()))
    await refreshNow($)

    $.clock.every(10_000, () => {
      $.session
        .usage()
        .then(latest => storeUsage($, snapshotOf(latest)))
        .catch(() => undefined)
    })
    $.clock.every(60_000, () => {
      refreshNow($).catch(() => undefined)
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await storeUsage($, snapshotOf(e))
    await refreshNow($)

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const snapshot = await read($, usage)

    if (snapshot === null) {
      return next(e)
    }

    const gauges = gaugesOf(snapshot, await read($, now))
    const { Box, Text } = $.ui.resolve(e)

    const segments = gauges.map(gauge => [
      <Text>{`${gauge.label} `}</Text>,
      <Text color={RING_COLORS[gauge.level]}>{`${ringGlyph(gauge.percent)} `}</Text>,
      <Text bold color={PERCENT_COLORS[gauge.level]}>{`${gauge.percent}%`}</Text>,
      ...(gauge.detail === undefined ? [] : [<Text dimColor>{` ${gauge.detail}`}</Text>]),
    ])

    if (e.props.modes.length > 0) {
      segments.push([<Text dimColor>{e.props.modes.join(' & ')}</Text>])
    }

    return (
      <Box key="usage" flexDirection="row" flexShrink={0}>
        <Text wrap="end">{segments.flatMap((segment, index) => (index === 0 ? segment : [<Text dimColor>{SEPARATOR}</Text>, ...segment]))}</Text>
      </Box>
    )
  })
}
