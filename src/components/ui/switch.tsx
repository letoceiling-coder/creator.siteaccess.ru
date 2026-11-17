import { useId, type ComponentProps } from 'react'
import { cn } from '@/shared/cn.ts'

type SwitchProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string
}

export function Switch({ label, className, id, ...props }: SwitchProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <label htmlFor={inputId} className="inline-flex min-h-11 items-center gap-3">
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="peer sr-only focus-visible:outline-none"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'bg-line-strong peer-checked:bg-accent-fill peer-focus-visible:outline-focus transition-studio chamfer-sm relative h-7 w-12 shrink-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-checked:[&>span]:translate-x-5',
          className,
        )}
      >
        <span className="bg-canvas-overlay chamfer-sm absolute top-0.5 left-0.5 size-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]" />
      </span>
      <span className="text-body text-ink">{label}</span>
    </label>
  )
}
