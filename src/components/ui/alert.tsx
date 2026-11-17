import type { ReactNode } from 'react'
import { cn } from '@/shared/cn.ts'

type AlertTone = 'info' | 'danger' | 'success'

const toneClass: Record<AlertTone, string> = {
  info: 'border-line text-ink',
  danger: 'border-danger text-danger',
  success: 'border-success text-success',
}

const markClass: Record<AlertTone, string> = {
  info: 'bg-ink',
  danger: 'bg-danger',
  success: 'bg-success',
}

interface AlertProps {
  tone: AlertTone
  title: string
  children?: ReactNode
}

export function Alert({ tone, title, children }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('bg-canvas-raised chamfer-sm flex gap-3 border-l-4 px-4 py-3', toneClass[tone])}
    >
      <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0', markClass[tone])} />
      <div className="grid gap-1">
        <p className="text-body font-medium">{title}</p>
        {children ? <div className="text-caption text-ink-muted">{children}</div> : null}
      </div>
    </div>
  )
}
