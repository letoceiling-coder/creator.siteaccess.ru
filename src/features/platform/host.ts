import type { HostBackButton, MaxHost, SafeAreaInsets, TelegramHost } from './types.ts'

export const emptyInsets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

export function readInsets(value: Partial<SafeAreaInsets> | undefined): SafeAreaInsets | null {
  if (!value) return null
  const { top, right, bottom, left } = value
  if (
    typeof top !== 'number' ||
    typeof right !== 'number' ||
    typeof bottom !== 'number' ||
    typeof left !== 'number'
  ) {
    return null
  }
  return { top, right, bottom, left }
}

export function isTelegramHost(host: TelegramHost | undefined): host is TelegramHost {
  return typeof host?.ready === 'function' && typeof host.close === 'function'
}

export function isMaxHost(host: MaxHost | undefined): host is MaxHost {
  if (typeof host?.ready !== 'function' || typeof host.close !== 'function') return false
  return typeof host.deviceName === 'string' || typeof host.downloadFile === 'function'
}

export function bindHostBack(button: HostBackButton | undefined, handler: () => void): () => void {
  if (!button) return () => undefined
  button.show()
  button.onClick(handler)
  return () => {
    button.offClick(handler)
    button.hide()
  }
}
