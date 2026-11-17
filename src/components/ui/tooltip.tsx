import { cloneElement, isValidElement, useId, useRef, useState, type ReactElement } from 'react'

interface TooltipProps {
  content: string
  children: ReactElement<{ 'aria-describedby'?: string }>
}

interface TooltipPlace {
  top: number
  left: number
  maxWidth: number
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<TooltipPlace | null>(null)
  if (!isValidElement(children)) return children
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ')

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    const margin = 16
    const maxWidth = Math.min(224, window.innerWidth - margin * 2)
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - margin - maxWidth)
    setPlace({ top: rect.bottom + 8, left, maxWidth })
  }

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPlace(null)}
      onFocus={show}
      onBlur={() => setPlace(null)}
    >
      {cloneElement(children, { 'aria-describedby': place ? describedBy : undefined })}
      {place ? (
        <span
          id={id}
          role="tooltip"
          style={{ top: place.top, left: place.left, maxWidth: place.maxWidth }}
          className="border-line bg-canvas-overlay text-caption text-ink shadow-overlay chamfer-sm pointer-events-none fixed z-30 w-max px-3 py-2"
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}
