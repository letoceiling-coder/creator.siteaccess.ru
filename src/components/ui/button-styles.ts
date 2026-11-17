import { cn } from '@/shared/cn.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'icon'

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'sweep bg-accent-fill text-accent-ink font-semibold hover:brightness-[1.08] active:brightness-95',
  secondary: 'bg-canvas-raised text-ink hover:bg-canvas-overlay',
  tertiary: 'bg-transparent text-accent hover:bg-wash',
  ghost: 'bg-transparent text-ink hover:bg-wash',
  danger: 'bg-danger-fill text-danger-ink hover:brightness-[1.06] active:brightness-95',
}

const sizeClass: Record<ButtonSize, string> = {
  md: 'px-4 text-body',
  sm: 'px-3 text-caption',
  icon: 'size-11 p-0',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 chamfer-sm font-medium tracking-tight transition-studio active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:active:scale-100 [transition-property:color,background-color,border-color,box-shadow,opacity]',
    variantClass[variant],
    sizeClass[size],
    className,
  )
}
