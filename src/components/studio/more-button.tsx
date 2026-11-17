import { ChevronDown } from 'lucide-react'
import { StudioButton } from './studio-button.tsx'

/** «Показать ещё» под списком каталога: сколько показано и сколько осталось. */
export function MoreButton({
  shown,
  total,
  left,
  step,
  onMore,
}: {
  shown: number
  total: number
  left: number
  step: number
  onMore: () => void
}) {
  return (
    <div className="grid justify-items-center gap-2 py-4">
      <p className="text-caption text-ink-muted tabular-nums" aria-live="polite">
        Показано {shown} из {total}
      </p>
      {left > 0 ? (
        <StudioButton variant="outline" onClick={onMore} className="min-w-56">
          <span className="inline-flex items-center gap-2">
            Показать ещё {Math.min(step, left)} <ChevronDown size={16} aria-hidden="true" />
          </span>
        </StudioButton>
      ) : null}
    </div>
  )
}
