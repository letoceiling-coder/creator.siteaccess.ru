import { Film, ScanFace, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { PosterCard } from '@/components/studio/poster-card.tsx'
import { ActionBar } from '@/components/studio/action-bar.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { LocationsGallery } from './locations-gallery.tsx'
import {
  categories,
  heroDeck,
  scenarios,
  type CategoryId,
  type Scenario,
} from '@/features/catalog/data.ts'

const enter = { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const }

function Label({ children }: { children: string }) {
  return (
    <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
      <span className="bg-accent h-px w-5" aria-hidden="true" />
      {children}
    </p>
  )
}

/* ───────────── Главная ───────────── */

function Deck() {
  const [order, setOrder] = useState([0, 1, 2])
  return (
    <div className="relative mx-auto aspect-[3/4] w-[66%]" aria-label="Примеры работ студии">
      {order.map((imgIndex, pos) => (
        <motion.div
          key={imgIndex}
          drag={pos === 0 ? 'x' : false}
          dragSnapToOrigin
          dragElastic={0.7}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) > 70 || Math.abs(info.velocity.x) > 500) {
              setOrder((o) => [...o.slice(1), o[0] ?? 0])
            }
          }}
          animate={{
            scale: 1 - pos * 0.06,
            y: pos * 16,
            rotate: pos === 0 ? 0 : pos % 2 ? 5 : -5,
            opacity: 1 - pos * 0.18,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          style={{ zIndex: order.length - pos, touchAction: 'pan-y' }}
          className="chamfer grain absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          <img
            src={heroDeck[imgIndex]}
            alt=""
            draggable={false}
            className="size-full object-cover select-none"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="tracking-label absolute bottom-3 left-4 text-[11px] text-white/85 uppercase">
            было фото — стал кадр
          </span>
        </motion.div>
      ))}
    </div>
  )
}

const steps = [
  { icon: Film, title: 'Сценарий', text: 'Выберите готовую съёмку по обложке' },
  { icon: ScanFace, title: 'Ваши фото', text: 'От одного до трёх снимков лица' },
  { icon: Sparkles, title: 'Кадры', text: 'Задача встаёт в очередь, можно уйти' },
]

export function HomeScreen({
  onOpen,
  onCatalog,
}: {
  onOpen: (id: string) => void
  onCatalog: () => void
}) {
  return (
    <div className="grid gap-12 pb-8">
      <section className="relative grid gap-6 overflow-hidden px-4 pt-6 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center md:gap-x-16 md:px-6 md:pt-14">
        <div
          className="bg-accent-fill/25 pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full blur-3xl"
          aria-hidden="true"
        />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={enter}
          className="relative grid gap-4 md:col-start-1 md:row-start-1"
        >
          <Label>Персональная студия</Label>
          <h1 className="font-display text-display text-ink text-balance">
            Кадры, где герой — <span className="text-accent">вы</span>
          </h1>
          <p className="text-body text-ink-muted max-w-sm">
            Выберите готовую съёмку, добавьте свои фото — остальное студия соберёт сама. Без
            промптов и настроек.
          </p>
        </motion.div>
        <div className="relative py-4 md:col-start-2 md:row-span-2 md:row-start-1">
          <Deck />
        </div>
        <div className="relative grid gap-3 md:col-start-1 md:row-start-2 md:max-w-xs">
          <StudioButton arrow onClick={onCatalog}>
            Выбрать фотосессию
          </StudioButton>
          <StudioButton variant="quiet">Смотреть видеосценарии</StudioButton>
        </div>
      </section>

      <section className="grid gap-5">
        <div className="px-4 md:px-6">
          <Label>Популярное</Label>
          <h2 className="font-display text-title text-ink mt-2">Фотосессии</h2>
        </div>
        <div className="hide-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:overflow-visible md:px-6">
          {scenarios.slice(0, 4).map((s, i) => (
            <PosterCard
              key={s.id}
              index={i}
              title={s.title}
              tag={s.tag}
              frames={s.frames}
              src={s.cover}
              onOpen={() => onOpen(s.id)}
              className="w-[58%] shrink-0 snap-start md:w-auto"
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 px-4 md:px-6">
        <div>
          <Label>Как это работает</Label>
          <h2 className="font-display text-title text-ink mt-2">Три шага до кадров</h2>
        </div>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ ...enter, delay: i * 0.08 }}
              className="chamfer-sm bg-canvas-raised grid grid-cols-[auto_1fr] items-center gap-4 p-4"
            >
              <span className="bg-accent-fill text-accent-ink chamfer-sm grid size-12 place-items-center">
                <step.icon size={22} aria-hidden="true" />
              </span>
              <span className="grid">
                <span className="font-display text-ink text-lg">
                  <span className="text-accent mr-2 tabular-nums">0{i + 1}</span>
                  {step.title}
                </span>
                <span className="text-caption text-ink-muted">{step.text}</span>
              </span>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="px-4 md:px-6">
        <div className="chamfer ticks bg-canvas-overlay border-line grid gap-3 border p-6">
          <span className="text-caption tracking-label text-accent uppercase">Скоро</span>
          <h2 className="font-display text-title text-ink">Видеосценарии</h2>
          <p className="text-body text-ink-muted">
            Ролик из сцен с раскадровкой: салон, лицо, улица, финал. Уже в каталоге, запуск
            откроется позже.
          </p>
        </div>
      </section>
    </div>
  )
}

/* ───────────── Каталог ───────────── */

export function CatalogScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [category, setCategory] = useState<CategoryId>('all')
  const list = useMemo(
    () => scenarios.filter((s) => category === 'all' || s.category === category),
    [category],
  )
  return (
    <div className="grid gap-5 px-4 pt-6 md:px-6">
      <div className="grid gap-2">
        <Label>Каталог</Label>
        <h1 className="font-display text-title text-ink text-[2rem]">Фотосессии</h1>
      </div>
      <ApertureTabs label="Категории" items={categories} value={category} onChange={setCategory} />
      <motion.div layout className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {list.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.22 }}
            >
              <PosterCard
                index={i}
                title={s.title}
                tag={s.tag}
                frames={s.frames}
                src={s.cover}
                onOpen={() => onOpen(s.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <LocationsGallery />
    </div>
  )
}

/* ───────────── Карточка сценария ───────────── */

export function ScenarioScreen({
  scenario,
  onCreate,
}: {
  scenario: Scenario
  onCreate: () => void
}) {
  return (
    <div className="md:grid md:grid-cols-2 md:items-start md:gap-12 md:px-6 md:pt-6">
      <div className="relative aspect-[4/5] overflow-hidden">
        <motion.img
          src={scenario.cover}
          alt={scenario.title}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 size-full object-cover"
        />
        <motion.span
          aria-hidden="true"
          initial={{ scaleY: 1 }}
          animate={{ scaleY: 0 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          style={{ transformOrigin: 'top' }}
          className="bg-canvas absolute inset-0 z-10"
        />
        <span className="from-canvas absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent" />
        <div className="absolute inset-x-0 bottom-0 grid gap-2 px-4 pb-5">
          <span className="text-caption tracking-label text-accent uppercase">{scenario.tag}</span>
          <h1 className="font-display text-display text-ink leading-[0.95]">{scenario.title}</h1>
        </div>
      </div>

      <div className="grid gap-8 px-4 pt-4 md:px-0 md:pt-10">
        <p className="text-body text-ink-muted">{scenario.blurb}</p>

        <div className="grid gap-3">
          <Label>Примеры кадров</Label>
          <div className="hide-scroll -mx-4 flex snap-x gap-2 overflow-x-auto px-4">
            {scenario.gallery.map((src, i) => (
              <motion.div
                key={src}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...enter, delay: 0.3 + i * 0.07 }}
                className="chamfer-sm w-32 shrink-0 snap-start"
              >
                <img src={src} alt="" className="aspect-[3/4] size-full object-cover" />
              </motion.div>
            ))}
          </div>
        </div>

        <dl className="border-line grid grid-cols-3 border-y py-4 text-center">
          {[
            ['На выходе', `${scenario.frames} кадров`],
            ['Фото', '1–3'],
            ['Очередь', scenario.eta.replace('около ', '≈ ')],
          ].map(([term, value]) => (
            <div key={term} className="grid gap-1 px-1">
              <dt className="text-caption tracking-label text-ink-muted text-[11px] uppercase">
                {term}
              </dt>
              <dd className="font-display text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-caption text-ink-muted">
          Ваши фотографии служат образцом лица. Сходство зависит от качества снимков. Срок — оценка
          очереди, не гарантия.
        </p>
        <ActionBar>
          <StudioButton arrow className="w-full" onClick={onCreate}>
            Создать
          </StudioButton>
        </ActionBar>
      </div>
    </div>
  )
}

/* ───────────── Заглушки вкладок ───────────── */

export function StubScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid justify-items-center gap-4 px-8 pt-32 text-center">
      <div className="chamfer bg-canvas-raised text-accent grid size-20 place-items-center">
        <Film size={30} aria-hidden="true" />
      </div>
      <h1 className="font-display text-title text-ink">{title}</h1>
      <p className="text-body text-ink-muted">{text}</p>
    </div>
  )
}
