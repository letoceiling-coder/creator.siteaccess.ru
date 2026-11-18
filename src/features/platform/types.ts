export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface HostBackButton {
  show: () => void
  hide: () => void
  onClick: (callback: () => void) => void
  offClick: (callback: () => void) => void
}

export interface TelegramHost {
  ready: () => void
  expand?: () => void
  close: () => void
  viewportStableHeight?: number
  safeAreaInset?: Partial<SafeAreaInsets>
  contentSafeAreaInset?: Partial<SafeAreaInsets>
  BackButton?: HostBackButton
  platform?: string
  initData?: string
}

export interface MaxHost {
  ready: () => void
  close: () => void
  deviceName?: string
  downloadFile?: (url: string, fileName: string) => Promise<unknown>
  getViewportSize?: () => Promise<{ height: string; width: string }>
  BackButton?: HostBackButton
  platform?: string
  initData?: string
}

export interface HostWindow {
  innerHeight?: number
  Telegram?: { WebApp?: TelegramHost }
  WebApp?: MaxHost
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramHost }
    WebApp?: MaxHost
  }
}

export type PlatformId = 'browser' | 'telegram' | 'max'

export interface EnvironmentSignals {
  telegramWebApp: boolean
  maxWebApp: boolean
  pathname: string
}

export interface PlatformAdapter {
  id: PlatformId
  sdkReady: boolean
  getSafeAreaInsets: () => SafeAreaInsets
  getViewportHeight: () => number | null
  signalReady: () => void
  close: () => void
  bindBack: (handler: () => void) => () => void
  /** Подписанные данные запуска мини-приложения — для входа без пароля. */
  getInitData: () => string | undefined
}
