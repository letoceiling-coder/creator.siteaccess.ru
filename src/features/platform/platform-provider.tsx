import { useEffect, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { PlatformContext } from './platform-context.ts'
import { readPlatformSnapshot } from './snapshot.ts'

export function PlatformProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const snapshot = useMemo(
    () => readPlatformSnapshot(window, location.pathname),
    [location.pathname],
  )

  useEffect(() => {
    snapshot.adapter.signalReady()
  }, [snapshot.adapter])

  return <PlatformContext.Provider value={snapshot}>{children}</PlatformContext.Provider>
}
