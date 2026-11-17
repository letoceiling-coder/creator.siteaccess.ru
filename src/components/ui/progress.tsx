interface ProgressProps {
  value: number
  label: string
}

export function Progress({ value, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-ink font-medium">{label}</span>
        <span className="text-caption text-ink-muted tabular-nums">{Math.round(clamped)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="bg-canvas-sunken h-2 overflow-hidden"
      >
        <div
          className="bg-accent-fill film-run h-full origin-left transition-transform duration-[360ms]"
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
    </div>
  )
}
