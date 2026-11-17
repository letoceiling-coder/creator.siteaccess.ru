import { bindHostBack, emptyInsets, readInsets } from './host.ts'
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
  }
}
