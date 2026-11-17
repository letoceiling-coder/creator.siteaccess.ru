import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/cn.ts'

type Variant = 'primary' | 'outline' | 'quiet'

const variants: Record<Variant, string> = {
  primary: 'sweep bg-accent-fill text-accent-ink font-semibold breathe',
  outline: 'bg-canvas-raised text-ink hover:bg-canvas-overlay transition-colors duration-[140ms]',
  quiet: 'text-accent hover:bg-wash',
}

type Props = Omit<ComponentProps<typeof motion.button>, 'children'> & {
  variant?: Variant
  arrow?: boolean
  children: ReactNode
}

/** Кнопка-видоискатель: фаска, световая полоса, стрелка выезжает при наведении. */
export function StudioButton({
  variant = 'primary',
  arrow = false,
  className,
  children,
  ...rest
}: Props) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.14 }}
      className={cn(
        'chamfer-sm group text-body inline-flex min-h-12 items-center justify-center gap-3 px-6 tracking-tight disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    >
      <span className="relative z-10">{children}</span>
      {arrow ? (
        <ArrowRight
          aria-hidden="true"
          size={18}
          className="relative z-10 transition-transform duration-[220ms] group-hover:translate-x-1"
        />
      ) : null}
    </motion.button>
  )
}
