import { createBrowserAdapter, createMaxAdapter, createTelegramAdapter } from './adapters.ts'
import { detectPlatform } from './detect-platform.ts'
import { isMaxHost, isTelegramHost } from './host.ts'
import type { HostWindow, PlatformAdapter, PlatformId } from './types.ts'

export interface PlatformSnapshot {
  id: PlatformId
  label: string
  sdkReady: boolean
  homePath: string
  reservesNavigationInset: boolean
  adapter: PlatformAdapter
}

const labels: Record<PlatformId, string> = {
  browser: 'Браузер',
  telegram: 'Telegram',
  max: 'MAX',
}

const homes: Record<PlatformId, string> = {
  browser: '/',
  telegram: '/telegram',
  max: '/max',
}

export function readPlatformSnapshot(
  win: HostWindow | undefined,
  pathname: string,
): PlatformSnapshot {
  const telegramHost = isTelegramHost(win?.Telegram?.WebApp) ? win?.Telegram?.WebApp : undefined
  const maxHost = !telegramHost && isMaxHost(win?.WebApp) ? win?.WebApp : undefined
  const id = detectPlatform({
    telegramWebApp: Boolean(telegramHost),
    maxWebApp: Boolean(maxHost),
    pathname,
  })
  const viewportHeight = typeof win?.innerHeight === 'number' ? win.innerHeight : null
  const sdkReady =
    (id === 'telegram' && Boolean(telegramHost)) || (id === 'max' && Boolean(maxHost))
  const adapter =
    id === 'telegram'
      ? createTelegramAdapter({ sdkReady, telegram: telegramHost, viewportHeight })
      : id === 'max'
        ? createMaxAdapter({ sdkReady, max: maxHost, viewportHeight })
        : createBrowserAdapter(viewportHeight)

  return {
    id,
    label: labels[id],
    sdkReady,
    homePath: homes[id],
    reservesNavigationInset: id !== 'browser',
    adapter,
  }
}
