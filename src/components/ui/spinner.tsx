import { IrisLoader } from '@/components/studio/iris-loader.tsx'

interface SpinnerProps {
  label?: string
}

export function Spinner({ label = 'Загрузка' }: SpinnerProps) {
  return (
    <div role="status" className="inline-flex min-h-11 items-center gap-3">
      <IrisLoader size={28} label={label} />
      <span className="text-body text-ink-muted">{label}</span>
    </div>
  )
}
