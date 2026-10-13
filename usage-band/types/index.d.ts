export type UsageLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageSnapshot = { limits: UsageLimit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: UsageSnapshot | null; now: number }
  }
}
