import type { EnvironmentSignals, PlatformId } from './types.ts'

export function detectPlatform(signals: EnvironmentSignals): PlatformId {
  if (signals.telegramWebApp) return 'telegram'
  if (signals.maxWebApp) return 'max'
  if (signals.pathname === '/telegram' || signals.pathname.startsWith('/telegram/')) {
    return 'telegram'
  }
  if (signals.pathname === '/max' || signals.pathname.startsWith('/max/')) return 'max'
  return 'browser'
}
