import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void) {
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', onStoreChange)
  window.addEventListener('resize', onStoreChange)
  return () => {
    viewport?.removeEventListener('resize', onStoreChange)
    window.removeEventListener('resize', onStoreChange)
  }
}

function getSnapshot(): string {
  const width = window.visualViewport?.width ?? window.innerWidth
  const height = window.visualViewport?.height ?? window.innerHeight
  return `${width}x${height}`
}

function getServerSnapshot(): string {
  return '0x0'
}

export function useVisualViewport(): { width: number; height: number } {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [rawWidth = '0', rawHeight = '0'] = value.split('x')
  return { width: Number(rawWidth), height: Number(rawHeight) }
}
