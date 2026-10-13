import type { SessionRateLimit } from 'claude-code'

import type { UsageSnapshot } from '../types'

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7j', spend_limit: 'Budget' }

const RING_GLYPHS = ['○', '◔', '◑', '◕', '●']

export type Level = 'normal' | 'warning' | 'error'

export type Gauge = { label: string; percent: number; detail?: string; level: Level }

export function snapshotOf(measure: { rateLimits: SessionRateLimit[] }): UsageSnapshot | null {
  if (measure.rateLimits.length === 0) {
    return null
  }

  return { limits: measure.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })) }
}

export function formatCountdown(resetsAt: string | undefined, nowMs: number): string | undefined {
  const resetMs = resetsAt === undefined ? NaN : Date.parse(resetsAt)

  if (Number.isNaN(resetMs) || nowMs === 0) {
    return undefined
  }

  const minutes = Math.max(0, Math.round((resetMs - nowMs) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  if (days > 0) {
    return `${days}j`
  }

  if (hours > 0) {
    return `${hours}h${String(mins).padStart(2, '0')}`
  }

  return `${mins}min`
}

function levelOf(percent: number): Level {
  if (percent >= 90) {
    return 'error'
  }

  return percent >= 75 ? 'warning' : 'normal'
}

export function gaugesOf(usage: UsageSnapshot, nowMs: number): Gauge[] {
  return usage.limits.map(limit => {
    const countdown = formatCountdown(limit.resetsAt, nowMs)

    return {
      label: LIMIT_LABELS[limit.kind] ?? limit.kind,
      percent: Math.round(limit.percentUsed),
      detail: countdown === undefined ? undefined : `↻${countdown}`,
      level: levelOf(limit.percentUsed),
    }
  })
}

export function ringGlyph(percent: number): string {
  if (percent <= 0 || percent >= 100) {
    return percent <= 0 ? '○' : '●'
  }

  return RING_GLYPHS[Math.min(3, Math.max(1, Math.round(percent / 25)))] ?? '◑'
}
