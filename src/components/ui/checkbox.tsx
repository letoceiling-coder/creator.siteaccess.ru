import { Check } from 'lucide-react'
import { useId, type ComponentProps } from 'react'
import { cn } from '@/shared/cn.ts'

type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <label htmlFor={inputId} className="inline-flex min-h-11 items-center gap-3">
      <input
        id={inputId}
        type="checkbox"
        className="peer sr-only focus-visible:outline-none"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'border-line-strong bg-canvas-sunken text-accent-ink peer-checked:border-accent-fill peer-checked:bg-accent-fill peer-focus-visible:outline-focus transition-studio chamfer-sm grid size-5 shrink-0 place-items-center border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-checked:[&>svg]:opacity-100',
          className,
        )}
      >
        <Check size={14} className="opacity-0 transition-opacity" />
      </span>
      <span className="text-body text-ink">{label}</span>
    </label>
  )
}
