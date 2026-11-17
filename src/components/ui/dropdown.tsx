import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { motionTokens } from '@/config/motion.ts'
import { cn } from '@/shared/cn.ts'
import { buttonClasses } from './button-styles.ts'

interface DropdownOption {
  value: string
  label: string
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly DropdownOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const reduceMotion = useReducedMotion()
  const current = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative grid gap-2">
      <span id={`${listId}-label`} className="text-caption text-ink font-medium">
        {label}
      </span>
      <button
        type="button"
        className={buttonClasses('secondary', 'md', 'w-full justify-between')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label ${listId}-value`}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span id={`${listId}-value`} className="truncate">
          {current?.label ?? 'Выбрать'}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-labelledby={`${listId}-label`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{
              duration: reduceMotion ? 0 : motionTokens.duration.fast,
              ease: [...motionTokens.ease.enter],
            }}
            className="border-line bg-canvas-overlay shadow-overlay chamfer-sm absolute top-full z-30 mt-2 max-h-64 w-full overflow-auto p-1"
          >
            {options.map((option) => {
              const selected = option.value === value
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      'text-body transition-studio min-h-11 w-full rounded-sm px-3 text-left',
                      selected ? 'bg-canvas-sunken text-ink' : 'text-ink hover:bg-wash',
                    )}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
