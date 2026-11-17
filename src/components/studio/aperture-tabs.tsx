import { LayoutGroup, motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/shared/cn.ts'

type Item<T extends string> = { id: T; label: string }

/** Переключатель с «линзой»: светящаяся пластина перетекает между пунктами. */
export function ApertureTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: Item<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const group = useId()
  return (
    <LayoutGroup id={group}>
      <div
        role="tablist"
        aria-label={label}
        className={cn('hide-scroll -mx-4 flex gap-1 overflow-x-auto px-4 py-1', className)}
      >
        {items.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'text-caption tracking-label relative min-h-11 shrink-0 px-4 font-medium uppercase transition-colors duration-[140ms]',
                active ? 'text-accent-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="lens"
                  className="chamfer-sm bg-accent-fill absolute inset-0"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
