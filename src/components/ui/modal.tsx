import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-title text-ink">
            {title}
          </h2>
          <button
            type="button"
            className="text-ink hover:bg-wash transition-studio inline-flex size-11 shrink-0 items-center justify-center"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="text-body text-ink-muted">{children}</div>
      </div>
    </dialog>
  )
}
