import { Coins, Film, Gift, ScanFace, Share2, Sparkles } from 'lucide-react'
import { videoTemplates } from '@/features/catalog/video-data.ts'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { PosterCard } from '@/components/studio/poster-card.tsx'
import { ActionBar } from '@/components/studio/action-bar.tsx'
import { MoreButton } from '@/components/studio/more-button.tsx'
import { photoCategories, photoStories, toScenario } from '@/features/catalog/photo-data.ts'
import { useMedia } from '@/features/media/use-media.ts'
import { usePaged } from '@/hooks/use-paged.ts'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { heroDeck, scenarios, type Scenario } from '@/features/catalog/data.ts'

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
  onVideo,
  onOpenVideo,
}: {
  onOpen: (id: string) => void
  onCatalog: () => void
  onVideo: () => void
  onOpenVideo: (id: string) => void
}) {
  const media = useMedia()
  // Видеосюжеты с готовыми роликами: сначала тренды и пары.
  const videos = videoTemplates
    .filter((v) => media.videos[v.id])
    .sort((a, b) => Number(b.category === 'trend') - Number(a.category === 'trend'))
    .slice(0, 8)
  // Популярное: трендовые сюжеты, у которых уже есть образцы.
  const popular = photoStories
    .map((story, i) => toScenario(story, media.photoStories[story.id], i))
    .filter((s) => s.category === 'trend' && media.photoStories[s.id])
    .slice(0, 8)
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
          <StudioButton variant="quiet" onClick={onVideo}>
            Смотреть видеосюжеты
          </StudioButton>
        </div>
      </section>

      <section className="grid gap-5">
        <div className="px-4 md:px-6">
          <Label>Популярное</Label>
          <h2 className="font-display text-title text-ink mt-2">Фотосессии</h2>
        </div>
        <div className="hide-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:overflow-visible md:px-6 lg:grid-cols-4">
          {(popular.length ? popular : scenarios.slice(0, 4)).map((s, i) => (
            <PosterCard
              key={s.id}
              index={i}
              title={s.title}
              tag={s.tag}
              frames={s.frames}
              src={media.photoStories[s.id]?.thumb ?? s.cover}
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

      {videos.length ? (
        <section className="grid gap-5">
          <div className="flex items-end justify-between gap-4 px-4 md:px-6">
            <div>
              <Label>Видеосюжеты</Label>
              <h2 className="font-display text-title text-ink mt-2">Вы в главной роли</h2>
            </div>
            <StudioButton variant="quiet" onClick={onVideo}>
              Все сюжеты
            </StudioButton>
          </div>
          <div className="hide-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:overflow-visible md:px-6">
            {videos.map((v, i) => (
              <PosterCard
                key={v.id}
                index={i}
                title={v.title}
                tag={v.people === 2 ? 'Вдвоём' : 'Видео'}
                frames={4}
                unit="сцены"
                src={media.videos[v.id]?.poster ?? v.cover}
                video={media.videos[v.id]?.preview}
                onOpen={() => onOpenVideo(v.id)}
                className="w-[58%] shrink-0 snap-start md:w-auto"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 px-4 md:grid-cols-3 md:px-6">
        {[
          [
            Gift,
            'Бонус при регистрации',
            'Новым пользователям — токены на первые фотосессии. Вход через почту, Яндекс, VK или Telegram.',
          ],
          [
            Coins,
            'Бесплатно каждый день',
            'Если токены закончились, каждый день на баланс приходят бесплатные — снова можно творить.',
          ],
          [
            Share2,
            'Приглашайте друзей',
            'Поделитесь своей ссылкой из кабинета: другу — бонус сразу, вам — когда он создаст первую работу.',
          ],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Gift
          return (
            <div
              key={String(title)}
              className="chamfer ticks bg-canvas-raised grid content-start gap-3 p-5"
            >
              <span className="bg-accent-fill text-accent-ink chamfer-sm grid size-11 place-items-center">
                <I size={20} aria-hidden="true" />
              </span>
              <h3 className="font-display text-ink text-lg">{String(title)}</h3>
              <p className="text-body text-ink-muted">{String(text)}</p>
            </div>
          )
        })}
      </section>

      <section className="px-4 md:px-6">
        <div className="chamfer grain bg-canvas-overlay grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid gap-2">
            <h2 className="font-display text-title text-ink">Начните со своей первой съёмки</h2>
            <p className="text-body text-ink-muted">
              Выберите сюжет, загрузите фото — через несколько минут кадры готовы.
            </p>
          </div>
          <StudioButton arrow onClick={onCatalog}>
            Выбрать фотосессию
          </StudioButton>
        </div>
      </section>
    </div>
  )
}

/* ───────────── Каталог ───────────── */

export function CatalogScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const media = useMedia()
  const [category, setCategory] = useState('all')
  // Пока сервер готовит образцы, показываем только сюжеты, у которых они уже есть.
  const ready = useMemo(() => {
    const withSamples = photoStories.filter((s) => media.photoStories[s.id])
    return withSamples.length ? withSamples : photoStories
  }, [media.photoStories])
  const list = useMemo(
    () =>
      ready
        .map((story, i) => toScenario(story, media.photoStories[story.id], i))
        .filter((s) => category === 'all' || s.category === category),
    [category, ready, media.photoStories],
  )
  const page = usePaged(list, 12)
  return (
    <div className="grid gap-5 px-4 pt-6 md:px-6">
      <div className="grid gap-2">
        <Label>Каталог</Label>
        <h1 className="font-display text-title text-ink text-[2rem]">Фотосессии</h1>
        <p className="text-body text-ink-muted max-w-xl">
          {ready.length} сюжетов: тренды, сезоны, студия, ретро, путешествия, праздники и кино. В
          каждом — пять кадров с разных ракурсов.
        </p>
      </div>
      <ApertureTabs
        label="Категории"
        items={photoCategories}
        value={category}
        onChange={setCategory}
      />
      <motion.div layout className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {page.visible.map((s, i) => (
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
                src={media.photoStories[s.id]?.thumb ?? s.cover}
                onOpen={() => onOpen(s.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <MoreButton
        shown={page.visible.length}
        total={page.total}
        left={page.left}
        step={12}
        onMore={page.more}
      />
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
