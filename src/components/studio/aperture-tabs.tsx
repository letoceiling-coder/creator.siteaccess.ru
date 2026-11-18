import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/shared/cn.ts'

type Item<T extends string> = { id: T; label: string }

/**
 * Переключатель с «линзой»: светящаяся пластина перетекает между пунктами.
 * Длинный список прокручивается: колесом мыши, перетаскиванием, стрелками по краям,
 * а выбранный пункт сам выезжает в видимую область.
 */
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
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef({ x: 0, left: 0, moved: false, active: false })
  const [edges, setEdges] = useState({ start: false, end: false })

  function measure() {
    const el = ref.current
    if (!el) return
    setEdges({
      start: el.scrollLeft > 4,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(el)
    // Вертикальное колесо мыши прокручивает список вбок, пока есть куда.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const canScroll =
        (event.deltaY > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) ||
        (event.deltaY < 0 && el.scrollLeft > 0)
      if (!canScroll) return
      event.preventDefault()
      el.scrollBy({ left: event.deltaY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer?.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [value])

  function scrollStep(direction: 1 | -1) {
    const el = ref.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' })
  }

  // Перетаскивание мышью (на телефоне работает родная прокрутка пальцем).
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !ref.current) return
    drag.current = { x: event.clientX, left: ref.current.scrollLeft, moved: false, active: true }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d.active || !ref.current) return
    const dx = event.clientX - d.x
    if (Math.abs(dx) > 4) d.moved = true
    ref.current.scrollLeft = d.left - dx
  }
  function onPointerUp() {
    drag.current.active = false
  }

  return (
    <LayoutGroup id={group}>
      <div className={cn('relative -mx-4 min-w-0', className)}>
        <div
          ref={ref}
          role="tablist"
          aria-label={label}
          onScroll={measure}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClickCapture={(event) => {
            // Клик после перетаскивания не переключает вкладку.
            if (drag.current.moved) {
              event.stopPropagation()
              drag.current.moved = false
            }
          }}
          className="hide-scroll flex snap-x gap-1 overflow-x-auto scroll-smooth px-4 py-1 select-none"
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
                  'text-caption tracking-label relative min-h-11 shrink-0 snap-start px-4 font-medium uppercase transition-colors duration-[140ms]',
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
        {edges.start ? (
          <button
            type="button"
            aria-label="Прокрутить категории назад"
            onClick={() => scrollStep(-1)}
            className="from-canvas via-canvas/90 text-ink absolute inset-y-0 left-0 hidden w-14 items-center justify-start bg-gradient-to-r to-transparent pl-2 md:flex"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        ) : null}
        {edges.end ? (
          <button
            type="button"
            aria-label="Прокрутить категории вперёд"
            onClick={() => scrollStep(1)}
            className="from-canvas via-canvas/90 text-ink absolute inset-y-0 right-0 flex w-14 items-center justify-end bg-gradient-to-l to-transparent pr-2"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </LayoutGroup>
  )
}
