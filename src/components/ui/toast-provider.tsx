import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motionTokens } from '@/config/motion.ts'
import { usePlatform } from '@/features/platform/use-platform.ts'
import { cn } from '@/shared/cn.ts'
import { ToastContext, type ToastItem, type ToastTone } from './toast-context.ts'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, number>>(new Map())
  const reduceMotion = useReducedMotion()
  const platform = usePlatform()

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current.slice(-2), { id, message, tone }])
      const timer = window.setTimeout(() => dismiss(id), 4000)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      for (const timer of activeTimers.values()) window.clearTimeout(timer)
    }
  }, [])

  const api = useMemo(() => ({ push }), [push])
  const bottom = platform.reservesNavigationInset
    ? 'calc(5.5rem + env(safe-area-inset-bottom))'
    : 'calc(1rem + env(safe-area-inset-bottom))'

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.p
              key={toast.id}
              role={toast.tone === 'danger' ? 'alert' : 'status'}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              transition={{
                duration: reduceMotion ? 0 : motionTokens.duration.base,
                ease: [...motionTokens.ease.enter],
              }}
              className={cn(
                'bg-canvas-overlay text-body shadow-overlay chamfer-sm pointer-events-auto flex w-full max-w-sm items-start gap-3 border-l-4 px-4 py-3',
                toast.tone === 'danger' ? 'border-danger text-danger' : 'border-line text-ink',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 size-2 shrink-0',
                  toast.tone === 'danger' ? 'bg-danger' : 'bg-accent',
                )}
              />
              <span>{toast.message}</span>
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
