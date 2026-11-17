import { useState } from 'react'
import { PosterCard } from '@/components/studio/poster-card.tsx'
import { Modal } from '@/components/ui/modal.tsx'
import { MoreButton } from '@/components/studio/more-button.tsx'
import { useMedia, type PhotoLocation } from '@/features/media/use-media.ts'
import { usePaged } from '@/hooks/use-paged.ts'

/** Образцы локаций: 30 мест по 5 кадров. Все изображения созданы ИИ. */
export function LocationsGallery() {
  const { photos } = useMedia()
  const [open, setOpen] = useState<PhotoLocation | undefined>()
  const page = usePaged(photos, 10)
  if (photos.length === 0) return null

  return (
    <section className="mt-6 grid gap-5" aria-labelledby="locations-title">
      <div className="grid gap-2">
        <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
          <span className="bg-accent h-px w-5" aria-hidden="true" />
          Образцы
        </p>
        <h2 id="locations-title" className="font-display text-title text-ink">
          Локации
        </h2>
        <p className="text-body text-ink-muted max-w-xl">
          {photos.length} мест по 5 планов. Так будет выглядеть съёмка. Все кадры созданы ИИ, на них
          вымышленные люди.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-5">
        {page.visible.map((loc, i) => (
          <PosterCard
            key={loc.id}
            index={i}
            title={loc.title}
            tag="Образец"
            frames={loc.shots.length}
            src={loc.shots[0]?.thumb ?? ''}
            onOpen={() => setOpen(loc)}
          />
        ))}
      </div>
      <MoreButton
        shown={page.visible.length}
        total={page.total}
        left={page.left}
        step={10}
        onMore={page.more}
      />
      <Modal open={Boolean(open)} title={open?.title ?? ''} onClose={() => setOpen(undefined)}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {open?.shots.map((shot) => (
            <figure key={shot.kind} className="chamfer-sm grid gap-1">
              <img
                src={shot.src}
                alt={`${open.title}: ${shot.label}`}
                loading="lazy"
                width={shot.w}
                height={shot.h}
                className="aspect-[3/4] w-full object-cover"
              />
              <figcaption className="text-caption text-ink-muted">{shot.label}</figcaption>
            </figure>
          ))}
        </div>
      </Modal>
    </section>
  )
}
