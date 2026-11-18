import { Music2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ActionBar } from '@/components/studio/action-bar.tsx'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { PosterCard } from '@/components/studio/poster-card.tsx'
import { ClipPlayer } from '@/components/studio/clip-player.tsx'
import { VideoPlayer } from '@/components/studio/video-player.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import {
  videoCategories,
  type VideoCategoryId,
  type VideoTemplate,
} from '@/features/catalog/video-data.ts'
import { videoTemplates } from '@/features/catalog/video-data.ts'
import { useMedia } from '@/features/media/use-media.ts'
import { usePaged } from '@/hooks/use-paged.ts'
import { MoreButton } from '@/components/studio/more-button.tsx'
import { CustomCta } from './custom-screens.tsx'
import { cn } from '@/shared/cn.ts'

function Label({ children }: { children: string }) {
  return (
    <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
      <span className="bg-accent h-px w-5" aria-hidden="true" />
      {children}
    </p>
  )
}

/* ───────────── Каталог шаблонов ───────────── */

export function VideoCatalogScreen({
  onOpen,
  onAnimate,
}: {
  onOpen: (id: string) => void
  onAnimate: () => void
}) {
  const media = useMedia()
  const [category, setCategory] = useState<VideoCategoryId>('all')
  const list = useMemo(() => {
    // Шаблоны с готовым роликом на сервере; пока роликов нет — все.
    const ready = videoTemplates.filter((v) => media.videos[v.id])
    return (ready.length ? ready : videoTemplates).filter(
      (v) => category === 'all' || v.category === category,
    )
  }, [category, media.videos])
  const page = usePaged(list, 10)
  return (
    <div className="grid gap-5 px-4 pt-6 md:px-6">
      <div className="grid gap-2">
        <Label>Каталог</Label>
        <h1 className="font-display text-title text-ink text-[2rem]">Видеошаблоны</h1>
        <p className="text-body text-ink-muted max-w-xl">
          {videoTemplates.length} шаблонов. Ваш ролик снимается как у съёмочной группы: общий,
          средний, крупный план и финал с движением камеры, переходы и музыка — около 19 секунд.
        </p>
      </div>
      <button
        type="button"
        onClick={onAnimate}
        className="chamfer ticks grain bg-canvas-raised hover:bg-canvas-overlay group flex min-h-20 items-center justify-between gap-4 p-4 text-left transition-colors duration-[140ms]"
      >
        <span className="grid gap-1">
          <span className="font-display text-ink text-xl">Оживить своё фото</span>
          <span className="text-caption text-ink-muted">
            Снимок приходит в движение: улыбка, ветер, поворот. 5 или 10 секунд. Подходит и для
            старых семейных фото.
          </span>
        </span>
        <span className="bg-accent-fill text-accent-ink chamfer-sm grid size-11 shrink-0 place-items-center transition-transform duration-[220ms] group-hover:translate-x-1">
          <Sparkles size={18} aria-hidden="true" />
        </span>
      </button>
      <ApertureTabs
        label="Категории видео"
        items={videoCategories}
        value={category}
        onChange={setCategory}
      />
      <motion.div layout className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-5">
        <AnimatePresence mode="popLayout">
          {page.visible.map((v, i) => (
            <motion.div
              key={v.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.22 }}
            >
              <PosterCard
                index={i}
                title={v.title}
                tag={v.people === 2 ? `Вдвоём · ${v.ratio}` : `≈19 с · ${v.ratio}`}
                frames={4}
                unit="сцены"
                src={media.videos[v.id]?.poster ?? v.cover}
                video={media.videos[v.id]?.preview}
                onOpen={() => onOpen(v.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <MoreButton
        shown={page.visible.length}
        total={page.total}
        left={page.left}
        step={10}
        onMore={page.more}
      />
      <CustomCta className="mt-4 px-0 md:px-0" />
    </div>
  )
}

/* ───────────── Карточка шаблона ───────────── */

function Equalizer({ bpm }: { bpm: number }) {
  const reduce = useReducedMotion()
  const bars = [0.5, 0.9, 0.6, 1, 0.7, 0.85, 0.45]
  return (
    <span className="flex h-8 items-end gap-1" aria-hidden="true">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="bg-accent block w-1 origin-bottom"
          style={{ height: '100%' }}
          initial={{ scaleY: h * 0.4 }}
          animate={reduce ? { scaleY: h } : { scaleY: [h * 0.35, h, h * 0.5] }}
          transition={{
            duration: 60 / bpm,
            repeat: Infinity,
            repeatType: 'mirror',
            delay: i * 0.06,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  )
}

export function VideoDetailScreen({
  template,
  onCatalog,
  onCreate,
}: {
  template: VideoTemplate
  onCatalog: () => void
  onCreate: () => void
}) {
  const clip = useMedia().videos[template.id]
  const category = videoCategories.find((c) => c.id === template.category)?.label
  return (
    <div className="grid gap-8 px-4 pt-4 md:grid-cols-2 md:items-start md:gap-12 md:px-6 md:pt-6">
      {clip ? (
        <ClipPlayer clip={clip} title={template.title} />
      ) : (
        <VideoPlayer template={template} />
      )}
      <div className="grid gap-8">
        <div className="grid gap-2">
          <span className="text-caption tracking-label text-accent uppercase">{category}</span>
          <h1 className="font-display text-display text-ink leading-[0.95]">{template.title}</h1>
          <p className="text-body text-ink-muted">{template.blurb}</p>
        </div>

        <dl className="border-line grid grid-cols-3 border-y py-4 text-center">
          {[
            ['Ролик', '≈19 с'],
            ['Формат', template.ratio],
            ['Фото', template.people === 2 ? '2 человека' : '1–3'],
          ].map(([term, value]) => (
            <div key={term} className="grid gap-1 px-1">
              <dt className="text-caption tracking-label text-ink-muted text-[11px] uppercase">
                {term}
              </dt>
              <dd className="font-display text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-3">
          <Label>Сценарий</Label>
          <ol className="grid gap-2">
            {template.shots.map((shot, i) => (
              <li
                key={shot}
                className="chamfer-sm bg-canvas-raised text-ink flex min-h-11 items-center gap-3 px-4"
              >
                <span className="text-accent font-display tabular-nums">0{i + 1}</span>
                {shot}
              </li>
            ))}
          </ol>
          {template.people === 2 ? (
            <p className="text-caption text-ink-muted">
              Сюжет на двоих: загрузите по одному фото каждого человека — пары или друзей.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3">
          <Label>Музыка</Label>
          <div className="chamfer bg-canvas-raised flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <Music2 size={22} className="text-accent shrink-0" aria-hidden="true" />
              <div className="grid">
                <span className="font-display text-ink">{template.music.genre}</span>
                <span className="text-caption text-ink-muted">
                  {template.music.bpm} BPM · {template.music.mood}
                </span>
              </div>
            </div>
            <Equalizer bpm={template.music.bpm} />
          </div>
          <p className="text-caption text-ink-muted">
            {clip?.withMusic
              ? 'Музыка в ролике создана ИИ по этому описанию. Для публикации трек заменят на лицензионный или проверят лицензию.'
              : 'В превью играет синтезированный набросок настроения. Финальный трек подберётся по этому описанию.'}
          </p>
        </div>

        <ActionBar>
          <div className={cn('grid gap-2 md:grid-cols-2')}>
            <StudioButton arrow className="w-full md:order-2" onClick={onCreate}>
              Создать со своим фото
            </StudioButton>
            <StudioButton variant="outline" className="md:order-1" onClick={onCatalog}>
              Все шаблоны
            </StudioButton>
          </div>
        </ActionBar>
      </div>
    </div>
  )
}
