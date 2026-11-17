import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/cn.ts'
import { fieldClasses, fieldErrorClass, fieldHintClass, fieldLabelClass } from './field-styles.ts'

type TextFieldProps = Omit<ComponentProps<'input'>, 'id' | 'aria-invalid' | 'aria-describedby'> & {
  id: string
  label: string
  hint?: string
  error?: string
  icon?: ReactNode
}

export function TextField({ id, label, hint, error, icon, className, ...props }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ')

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className="text-ink-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={fieldClasses(Boolean(error), Boolean(icon), cn('min-h-11', className))}
          {...props}
        />
      </div>
      {hint ? (
        <p id={hintId} className={fieldHintClass}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
