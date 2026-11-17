import type { ReactNode } from 'react'

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="chamfer ticks bg-canvas-sunken grid justify-items-start gap-3 px-5 py-8">
      <h3 className="font-display text-title text-ink">{title}</h3>
      <p className="text-body text-ink-muted max-w-md">{children}</p>
      {action}
    </div>
  )
}
