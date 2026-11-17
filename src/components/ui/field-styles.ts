import { cn } from '@/shared/cn.ts'

export function fieldClasses(invalid: boolean, withIcon = false, className?: string): string {
  return cn(
    'bg-canvas-sunken text-body text-ink placeholder:text-ink-muted w-full rounded-none border-0 border-b-2 px-3 transition-studio focus:border-accent focus-visible:outline-none focus:bg-canvas-raised disabled:cursor-not-allowed disabled:opacity-50',
    withIcon && 'pl-11',
    invalid ? 'border-danger' : 'border-line-strong',
    className,
  )
}

export const fieldLabelClass = 'text-caption text-ink font-medium'
export const fieldHintClass = 'text-caption text-ink-muted'
export const fieldErrorClass = 'text-caption text-danger'
