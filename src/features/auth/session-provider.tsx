import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { usePlatform } from '@/features/platform/use-platform.ts'
import { apiFetch } from './http.ts'
import { fetchMe, loginWebApp, rememberRef, SessionContext, type Me } from './session.ts'

/**
 * Сессия пользователя: профиль и баланс с сервера. В мини-приложениях Telegram и MAX
 * вход происходит сам по подписанным данным запуска.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform()
  const location = useLocation()
  const [me, setMe] = useState<Me>()
  const [loading, setLoading] = useState(true)
  const tried = useRef(false)

  useEffect(() => rememberRef(location.search), [location.search])

  const refresh = useCallback(async () => {
    try {
      setMe(await fetchMe())
    } catch {
      setMe(undefined)
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      let current: Me | undefined
      try {
        current = await fetchMe()
      } catch {
        current = undefined
      }
      const initData = platform.adapter.getInitData()
      if (
        !current &&
        !tried.current &&
        initData &&
        (platform.id === 'telegram' || platform.id === 'max')
      ) {
        tried.current = true
        try {
          current = await loginWebApp(platform.id, initData)
        } catch {
          current = undefined
        }
      }
      if (alive) {
        setMe(current)
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [platform])

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setMe(undefined)
  }, [])

  const value = useMemo(
    () => ({
      status: loading ? ('loading' as const) : me ? ('user' as const) : ('guest' as const),
      me,
      refresh,
      setMe,
      logout,
    }),
    [loading, me, refresh, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
