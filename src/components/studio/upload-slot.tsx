import { Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

/** Ячейка кадра: пустая с пунктирной рамкой, после выбора снимок «проявляется». */
export function UploadSlot({
  src,
  index,
  caption,
  onAdd,
  onRemove,
}: {
  src?: string
  index: number
  /** Подпись слота, например «Первый» для сюжета на двоих. */
  caption?: string
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <div className="chamfer-sm relative aspect-[3/4]">
      <AnimatePresence mode="wait" initial={false}>
        {src ? (
          <motion.div
            key="filled"
            className="bg-canvas-sunken absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.22 }}
          >
            <img src={src} alt={`Фото ${index + 1}`} className="develop size-full object-cover" />
            <button
              type="button"
              aria-label={`Убрать фото ${index + 1}`}
              onClick={onRemove}
              className="absolute top-0 right-0 grid size-11 place-items-center text-white"
            >
              <span className="grid size-7 place-items-center bg-black/60 backdrop-blur-sm">
                <X size={14} aria-hidden="true" />
              </span>
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={onAdd}
            aria-label={
              caption
                ? `Добавить фото: ${caption.toLowerCase()} человек`
                : `Добавить фото ${index + 1}`
            }
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-line-strong text-ink-muted hover:text-accent hover:border-accent absolute inset-0 grid place-items-center border border-dashed transition-colors duration-[140ms]"
          >
            <span className="grid place-items-center gap-1">
              <Plus size={22} aria-hidden="true" />
              <span className="tracking-label text-[11px] uppercase tabular-nums">
                {caption ?? String(index + 1).padStart(2, '0')}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
