import { motion, useReducedMotion } from 'motion/react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motionTokens } from '@/config/motion.ts'
import { cn } from '@/shared/cn.ts'

interface TabItem {
  id: string
  label: string
  panel: ReactNode
}

export function Tabs({ label, tabs }: { label: string; tabs: readonly TabItem[] }) {
  const uid = useId()
  const reduceMotion = useReducedMotion()
  const [selected, setSelected] = useState(tabs[0]?.id ?? '')
  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === selected)
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + direction + tabs.length) % tabs.length]
    if (!next) return
    setSelected(next.id)
    document.getElementById(`${uid}-${next.id}`)?.focus()
  }

  if (!current) return null

  return (
    <div className="grid min-w-0 gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="border-line flex min-w-0 gap-1 overflow-x-auto border-b"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.id === current.id
          return (
            <button
              key={tab.id}
              id={`${uid}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className={cn(
                'transition-studio relative min-h-11 shrink-0 px-3',
                active ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
              onClick={() => setSelected(tab.id)}
            >
              {active ? (
                <motion.span
                  layoutId={reduceMotion ? undefined : `${uid}-tab`}
                  className="bg-accent chamfer-sm absolute inset-x-3 bottom-0 h-1"
                  transition={{
                    duration: reduceMotion ? 0 : motionTokens.duration.base,
                    ease: [...motionTokens.ease.standard],
                  }}
                />
              ) : null}
              <span className="text-body relative">{tab.label}</span>
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel-${current.id}`}
        aria-labelledby={`${uid}-${current.id}`}
        className="text-body text-ink min-h-16"
      >
        {current.panel}
      </div>
    </div>
  )
}
