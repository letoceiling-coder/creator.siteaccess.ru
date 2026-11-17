import { cn } from '@/shared/cn.ts'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-line chamfer-sm animate-pulse motion-reduce:animate-none', className)}
    />
  )
}
