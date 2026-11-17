import { describe, expect, it } from 'vitest'
import { bindHostBack } from './host.ts'
import { readPlatformSnapshot } from './snapshot.ts'
import type { HostWindow } from './types.ts'

const telegramHost: HostWindow = {
  innerHeight: 700,
  Telegram: {
    WebApp: {
      ready() {},
      close() {},
      viewportStableHeight: 640,
      safeAreaInset: { top: 8, right: 0, bottom: 10, left: 0 },
      contentSafeAreaInset: { top: 47, right: 0, bottom: 34, left: 0 },
    },
  },
  WebApp: {
    ready() {},
    close() {},
    deviceName: 'should-not-win',
  },
}

describe('platform snapshot', () => {
  it('prefers a real Telegram host over MAX and over the route', () => {
    const snapshot = readPlatformSnapshot(telegramHost, '/max')
    expect(snapshot.id).toBe('telegram')
    expect(snapshot.sdkReady).toBe(true)
    expect(snapshot.adapter.getSafeAreaInsets().top).toBe(47)
    expect(snapshot.adapter.getViewportHeight()).toBe(640)
  })

  it('detects MAX from its host markers', () => {
    const snapshot = readPlatformSnapshot(
      {
        innerHeight: 800,
        WebApp: { ready() {}, close() {}, deviceName: 'Pixel' },
      },
      '/',
    )
    expect(snapshot.id).toBe('max')
    expect(snapshot.sdkReady).toBe(true)
    expect(snapshot.homePath).toBe('/max')
  })

  it('uses the route as a preview when no host SDK exists', () => {
    const snapshot = readPlatformSnapshot({ innerHeight: 500 }, '/telegram')
    expect(snapshot.id).toBe('telegram')
    expect(snapshot.sdkReady).toBe(false)
    expect(snapshot.reservesNavigationInset).toBe(true)
    expect(snapshot.adapter.getSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('stays in the browser shell on the public route', () => {
    const snapshot = readPlatformSnapshot({ innerHeight: 900 }, '/')
    expect(snapshot).toMatchObject({
      id: 'browser',
      label: 'Браузер',
      sdkReady: false,
      homePath: '/',
    })
  })

  it('binds and releases a host back button', () => {
    const calls: string[] = []
    let stored: (() => void) | undefined
    const unbind = bindHostBack(
      {
        show: () => calls.push('show'),
        hide: () => calls.push('hide'),
        onClick: (callback) => {
          stored = callback
        },
        offClick: () => calls.push('off'),
      },
      () => calls.push('run'),
    )
    stored?.()
    unbind()
    expect(calls).toEqual(['show', 'run', 'off', 'hide'])
  })
})
