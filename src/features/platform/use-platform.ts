import { useContext } from 'react'
import { PlatformContext } from './platform-context.ts'
import type { PlatformSnapshot } from './snapshot.ts'

export function usePlatform(): PlatformSnapshot {
  const value = useContext(PlatformContext)
  if (!value) {
    throw new Error('usePlatform must be used within PlatformProvider')
  }
  return value
}
