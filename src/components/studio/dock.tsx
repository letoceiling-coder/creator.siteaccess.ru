import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/shared/cn.ts'

export type DockItem<T extends string> = { id: T; label: string; icon: LucideIcon }

/** Нижняя навигация: плавающая плита, вольфрамовая капля перетекает под активным пунктом. */
export function Dock<T extends string>({
  className,
  items,
  value,
  onChange,
}: {
  className?: string
  items: DockItem<T>[]
  value: T | undefined
  onChange: (id: T) => void
}) {
  return (
    <nav
      aria-label="Разделы"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <ul className="surface-glass chamfer border-line shadow-overlay pointer-events-auto mx-auto grid max-w-sm auto-cols-fr grid-flow-col border p-1.5">
        {items.map((item) => {
          const active = item.id === value
          const Icon = item.icon
          return (
            <li key={item.id} className="contents">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onChange(item.id)}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-[140ms]',
                  active ? 'text-accent-ink' : 'text-ink-muted',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="dock-blob"
                    className="chamfer-sm bg-accent-fill absolute inset-0"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                ) : null}
                <motion.span
                  className="relative"
                  animate={{ y: active ? -1 : 0, scale: active ? 1.12 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                >
                  <Icon size={20} aria-hidden="true" />
                </motion.span>
                <span className="relative">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
