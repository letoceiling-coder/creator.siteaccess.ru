import { bindHostBack, emptyInsets, readInsets } from './host.ts'
import { initDataFromHash } from './load-sdk.ts'
import type { MaxHost, PlatformAdapter, TelegramHost } from './types.ts'

interface AdapterInput {
  sdkReady: boolean
  telegram?: TelegramHost
  max?: MaxHost
  viewportHeight: number | null
}

export function createBrowserAdapter(viewportHeight: number | null): PlatformAdapter {
  return {
    id: 'browser',
    sdkReady: false,
    getSafeAreaInsets: () => emptyInsets,
    getViewportHeight: () => viewportHeight,
    signalReady: () => undefined,
    close: () => undefined,
    bindBack: () => () => undefined,
    getInitData: () => undefined,
    share: () => Promise.resolve(false),
  }
}

export function createTelegramAdapter(input: AdapterInput): PlatformAdapter {
  const host = input.sdkReady ? input.telegram : undefined
  return {
    id: 'telegram',
    sdkReady: input.sdkReady,
    getSafeAreaInsets: () =>
      readInsets(host?.contentSafeAreaInset) ?? readInsets(host?.safeAreaInset) ?? emptyInsets,
    getViewportHeight: () => host?.viewportStableHeight ?? input.viewportHeight,
    signalReady: () => {
      host?.ready()
    },
    close: () => {
      host?.close()
    },
    bindBack: (handler) => bindHostBack(host?.BackButton, handler),
    getInitData: () =>
      host?.initData || initDataFromHash('telegram', globalThis.location?.hash ?? ''),
    // Экран Telegram «Переслать»: выбор контакта, чата или канала.
    share: (text, url) => {
      if (!host?.openTelegramLink) return Promise.resolve(false)
      const params = new URLSearchParams({ url, text })
      host.openTelegramLink(`https://t.me/share/url?${params.toString()}`)
      return Promise.resolve(true)
    },
  }
}

export function createMaxAdapter(input: AdapterInput): PlatformAdapter {
  const host = input.sdkReady ? input.max : undefined
  return {
    id: 'max',
    sdkReady: input.sdkReady,
    getSafeAreaInsets: () => emptyInsets,
    getViewportHeight: () => input.viewportHeight,
    signalReady: () => {
      host?.ready()
    },
    close: () => {
      host?.close()
    },
    bindBack: (handler) => bindHostBack(host?.BackButton, handler),
    getInitData: () => host?.initData || initDataFromHash('max', globalThis.location?.hash ?? ''),
    // Экран MAX «Поделиться»: выбор контакта или чата внутри MAX; иначе — системное меню.
    share: async (text, url) => {
      const fn = host?.shareMaxContent ?? host?.shareContent
      if (!fn) return false
      try {
        await fn.call(host, { text, link: url })
      } catch {
        // пользователь закрыл экран
      }
      return true
    },
  }
}
