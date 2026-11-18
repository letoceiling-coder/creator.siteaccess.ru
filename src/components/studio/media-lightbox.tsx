import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface LightboxItem {
  kind: 'photo' | 'video'
  src: string
  poster?: string
}

/**
 * Просмотр фото и видео на весь экран: стрелки, свайп, клавиши ← → и Esc.
 * index === undefined — окно закрыто.
 */
export function MediaLightbox({
  items,
  index,
  onIndex,
  label = 'Просмотр',
}: {
  items: LightboxItem[]
  index: number | undefined
  onIndex: (i: number | undefined) => void
  label?: string
}) {
  const open = index !== undefined && items[index] !== undefined
  const closeRef = useRef<HTMLButtonElement>(null)
  const startX = useRef<number | null>(null)
  const count = items.length

  const go = useCallback(
    (d: 1 | -1) => {
      if (index === undefined || count < 2) return
      onIndex((index + d + count) % count)
    },
    [index, count, onIndex],
  )

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(undefined)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus()
    }
  }, [open, go, onIndex])

  const item = open ? items[index] : undefined

  return createPortal(
    <AnimatePresence>
      {item ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-black/92 text-white"
          onPointerDown={(e) => {
            startX.current = e.clientX
          }}
          onPointerUp={(e) => {
            if (startX.current === null) return
            const dx = e.clientX - startX.current
            startX.current = null
            if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
          }}
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <span className="text-caption text-white/80 tabular-nums">
              {(index ?? 0) + 1} / {count}
            </span>
            <span className="flex gap-1">
              <a
                href={item.src}
                download
                target="_blank"
                rel="noreferrer"
                className="grid size-11 place-items-center text-white/85 hover:text-white"
                aria-label="Скачать"
              >
                <Download size={20} aria-hidden="true" />
              </a>
              <button
                ref={closeRef}
                type="button"
                onClick={() => onIndex(undefined)}
                className="grid size-11 place-items-center text-white/85 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </span>
          </div>

          <div className="relative grid min-h-0 place-items-center px-2 sm:px-16">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={item.src}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="grid size-full min-h-0 place-items-center"
              >
                {item.kind === 'video' ? (
                  <video
                    src={item.src}
                    poster={item.poster}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <img
                    src={item.src}
                    alt=""
                    draggable={false}
                    className="max-h-full max-w-full object-contain select-none"
                  />
                )}
              </motion.div>
            </AnimatePresence>
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Предыдущее"
                  className="absolute top-1/2 left-1 grid size-11 -translate-y-1/2 place-items-center bg-black/40 text-white hover:bg-black/60 sm:left-3"
                >
                  <ChevronLeft size={24} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Следующее"
                  className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center bg-black/40 text-white hover:bg-black/60 sm:right-3"
                >
                  <ChevronRight size={24} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>

          {count > 1 ? (
            <div className="hide-scroll flex justify-center gap-2 overflow-x-auto px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {items.map((it, i) => (
                <button
                  key={it.src}
                  type="button"
                  onClick={() => onIndex(i)}
                  aria-label={`Открыть ${i + 1}`}
                  aria-current={i === index}
                  className={
                    i === index
                      ? 'size-14 shrink-0 opacity-100 outline-2 outline-white'
                      : 'size-14 shrink-0 opacity-55 hover:opacity-90'
                  }
                >
                  <img
                    src={it.poster ?? it.src}
                    alt=""
                    className="size-full object-cover"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="pb-[max(env(safe-area-inset-bottom),0.75rem)]" />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
