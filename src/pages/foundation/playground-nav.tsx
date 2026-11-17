import { useEffect, useState } from 'react'
import { cn } from '@/shared/cn.ts'
import { playgroundSections } from './playground-sections.ts'

export function PlaygroundNav() {
  const [active, setActive] = useState<string>(playgroundSections[0][0])

  useEffect(() => {
    const nodes = playgroundSections
      .map(([id]) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target.id) setActive(visible.target.id)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.15, 0.4] },
    )
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Группы компонентов"
      className="bg-canvas sticky top-16 z-20 mb-8 max-w-full min-w-0 overflow-x-auto overscroll-x-contain py-2 lg:top-20 lg:mb-0 lg:self-start lg:overflow-visible lg:bg-transparent lg:py-0"
    >
      <ul className="flex w-max gap-2 lg:grid lg:w-full lg:gap-1">
        {playgroundSections.map(([id, label]) => {
          const current = active === id
          return (
            <li key={id} className="shrink-0 lg:shrink">
              <a
                href={`#${id}`}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'text-caption transition-studio inline-flex min-h-11 items-center rounded-md px-3 lg:w-full lg:border-l-2 lg:px-3',
                  current
                    ? 'bg-canvas-raised text-ink lg:border-accent lg:bg-transparent'
                    : 'text-ink-muted hover:text-ink border-transparent',
                )}
              >
                {label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
