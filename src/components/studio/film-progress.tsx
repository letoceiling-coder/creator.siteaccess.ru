import { motion } from 'motion/react'
import { cn } from '@/shared/cn.ts'

/** Прогресс в виде плёнки: готовые кадры светятся, текущий «бежит». */
export function FilmProgress({
  frames,
  done,
  className,
}: {
  frames: number
  done: number
  className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-label="Готовность кадров"
      aria-valuemin={0}
      aria-valuemax={frames}
      aria-valuenow={done}
      className={cn('flex gap-1', className)}
    >
      {Array.from({ length: frames }, (_, i) => {
        const state = i < done ? 'done' : i === done ? 'run' : 'idle'
        return (
          <motion.span
            key={i}
            className={cn(
              'chamfer-sm relative h-9 flex-1 overflow-hidden',
              state === 'idle' ? 'bg-canvas-sunken' : 'bg-accent-fill',
            )}
            animate={{ opacity: state === 'idle' ? 0.6 : 1 }}
          >
            {state === 'run' ? <span className="film-run absolute inset-0" /> : null}
          </motion.span>
        )
      })}
    </div>
  )
}
