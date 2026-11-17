import type { ReactNode } from 'react'
import { cn } from '@/shared/cn.ts'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger'

const toneClass: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-ink',
  accent: 'border-accent text-accent',
  success: 'border-success text-success',
  danger: 'border-danger text-danger',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'text-caption chamfer-sm bg-canvas-sunken tracking-label inline-flex min-h-7 items-center border-l-2 px-2.5 text-[11px] font-medium uppercase',
        toneClass[tone],
      )}
    >
      {children}
    </span>
  )
}
