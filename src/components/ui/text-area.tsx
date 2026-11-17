import type { ComponentProps } from 'react'
import { cn } from '@/shared/cn.ts'
import { fieldClasses, fieldErrorClass, fieldHintClass, fieldLabelClass } from './field-styles.ts'

type TextAreaProps = Omit<
  ComponentProps<'textarea'>,
  'id' | 'aria-invalid' | 'aria-describedby'
> & {
  id: string
  label: string
  hint?: string
  error?: string
}

export function TextArea({ id, label, hint, error, className, ...props }: TextAreaProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ')

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={fieldClasses(Boolean(error), false, cn('min-h-32 py-3', className))}
        {...props}
      />
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
