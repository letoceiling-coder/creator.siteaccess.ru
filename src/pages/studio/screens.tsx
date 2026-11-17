import { Check, Clock, Download, Film, ImagePlus, ScanFace, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { FilmProgress } from '@/components/studio/film-progress.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { PosterCard } from '@/components/studio/poster-card.tsx'
import { ActionBar } from '@/components/studio/action-bar.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { UploadSlot } from '@/components/studio/upload-slot.tsx'
import { cn } from '@/shared/cn.ts'
import {
  categories,
  heroDeck,
  samplePhotos,
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

/* ───────────── Мастер ───────────── */

const wizardSteps = ['Фото', 'Образ', 'Проверка']
const outfits = ['Как в сценарии', 'Светлый костюм', 'Тёмное пальто']
const times = [
  { id: 'day', label: 'День' },
  { id: 'dusk', label: 'Закат' },
  { id: 'night', label: 'Ночь' },
] as const

function StepRail({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-3 gap-1" aria-label="Шаги">
      {wizardSteps.map((name, i) => (
        <li key={name} aria-current={i === step ? 'step' : undefined} className="grid gap-2">
          <span className="bg-canvas-sunken relative block h-1 overflow-hidden">
            <motion.span
              className="bg-accent-fill absolute inset-0 origin-left"
              initial={false}
              animate={{ scaleX: i <= step ? 1 : 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span
            className={cn(
              'text-caption tracking-label uppercase transition-colors duration-[220ms]',
              i === step ? 'text-accent' : 'text-ink-muted',
            )}
          >
            0{i + 1} {name}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function WizardScreen({
  scenario,
  onDone,
  onBack,
}: {
  scenario: Scenario
  onDone: () => void
  onBack: () => void
}) {
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<(string | undefined)[]>([undefined, undefined, undefined])
  const [outfit, setOutfit] = useState(0)
  const [time, setTime] = useState<(typeof times)[number]['id']>('day')
  const [wish, setWish] = useState('')
  const count = photos.filter(Boolean).length

  function add(slot: number) {
    setPhotos((p) => p.map((v, i) => (i === slot ? (samplePhotos[slot] ?? samplePhotos[0]) : v)))
  }
  function addNext() {
    const free = photos.findIndex((p) => !p)
    if (free >= 0) add(free)
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 pt-4 md:px-6">
      <StepRail step={step} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-6"
        >
          {step === 0 ? (
            <>
              <div className="grid gap-2">
                <h1 className="font-display text-title text-ink text-[1.75rem]">Ваши фото</h1>
                <p className="text-body text-ink-muted">
                  Лицо видно, без сильного фильтра и перекрытия. Лучше два-три ракурса.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((src, i) => (
                  <UploadSlot
                    key={i}
                    index={i}
                    src={src}
                    onAdd={() => add(i)}
                    onRemove={() => setPhotos((p) => p.map((v, j) => (j === i ? undefined : v)))}
                  />
                ))}
              </div>
              <StudioButton variant="outline" onClick={addNext} disabled={count === 3}>
                <span className="inline-flex items-center gap-2">
                  <ImagePlus size={18} aria-hidden="true" /> Выбрать с телефона
                </span>
              </StudioButton>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Образ</h1>
              <div className="grid gap-2">
                <Label>Одежда</Label>
                <div className="grid gap-2" role="radiogroup" aria-label="Одежда">
                  {outfits.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={outfit === i}
                      onClick={() => setOutfit(i)}
                      className={cn(
                        'chamfer-sm relative flex min-h-14 items-center justify-between px-4 text-left transition-colors duration-[140ms]',
                        outfit === i
                          ? 'bg-canvas-overlay text-ink'
                          : 'bg-canvas-raised text-ink-muted',
                      )}
                    >
                      {outfit === i ? (
                        <motion.span
                          layoutId="outfit-bar"
                          className="bg-accent-fill absolute inset-y-0 left-0 w-1"
                        />
                      ) : null}
                      <span>{name}</span>
                      <motion.span
                        initial={false}
                        animate={{ scale: outfit === i ? 1 : 0, opacity: outfit === i ? 1 : 0 }}
                        className="bg-accent-fill text-accent-ink grid size-6 place-items-center"
                      >
                        <Check size={14} aria-hidden="true" />
                      </motion.span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Время суток</Label>
                <ApertureTabs
                  label="Время суток"
                  items={[...times]}
                  value={time}
                  onChange={setTime}
                />
              </div>
              <label className="grid gap-2">
                <span className="flex items-center justify-between">
                  <Label>Пожелание, необязательно</Label>
                  <span className="text-caption text-ink-muted tabular-nums">
                    {wish.length}/200
                  </span>
                </span>
                <textarea
                  value={wish}
                  maxLength={200}
                  onChange={(e) => setWish(e.target.value)}
                  rows={3}
                  placeholder="Например, больше тёплого света"
                  className="chamfer-sm bg-canvas-sunken text-ink placeholder:text-ink-muted focus:ring-accent min-h-24 resize-none p-4 outline-none focus:ring-2"
                />
              </label>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Проверьте задачу</h1>
              <div className="chamfer ticks bg-canvas-raised grid gap-5 p-5">
                <div className="flex gap-3">
                  <img
                    src={scenario.cover}
                    alt=""
                    className="chamfer-sm aspect-[3/4] w-20 object-cover"
                  />
                  <div className="grid content-center gap-1">
                    <span className="text-caption tracking-label text-accent uppercase">
                      Сценарий
                    </span>
                    <span className="font-display text-ink text-xl">{scenario.title}</span>
                    <span className="text-caption text-ink-muted">{scenario.frames} кадров</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {photos.filter(Boolean).map((src, i) => (
                    <img key={i} src={src} alt="" className="chamfer-sm size-14 object-cover" />
                  ))}
                </div>
                <dl className="divide-line border-line text-body grid divide-y border-y">
                  {[
                    ['Одежда', outfits[outfit] ?? ''],
                    ['Время', times.find((t) => t.id === time)?.label ?? ''],
                    ['Очередь', scenario.eta.replace('около ', '≈ ')],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-3">
                      <dt className="text-ink-muted">{k}</dt>
                      <dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <ActionBar>
        <StudioButton
          arrow
          disabled={step === 0 && count === 0}
          onClick={() => (step === 2 ? onDone() : setStep(step + 1))}
        >
          {step === 2 ? 'Подтвердить создание' : 'Дальше'}
        </StudioButton>
        <StudioButton variant="quiet" onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
          Назад
        </StudioButton>
      </ActionBar>
    </div>
  )
}

/* ───────────── Задача и результат ───────────── */

export function JobScreen({ scenario, onHome }: { scenario: Scenario; onHome: () => void }) {
  const [done, setDone] = useState(-1)

  useEffect(() => {
    const id = window.setInterval(() => setDone((d) => Math.min(d + 1, scenario.frames)), 1100)
    return () => window.clearInterval(id)
  }, [scenario.frames])

  const finished = done >= scenario.frames
  const queued = done < 0
  const shots = [...scenario.gallery, ...samplePhotos].slice(0, scenario.frames)

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 pt-8 md:px-6">
      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enter}
            className="grid gap-6"
          >
            <div className="grid gap-2">
              <Label>Готово</Label>
              <h1 className="font-display text-title text-ink text-[1.75rem]">{scenario.title}</h1>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {shots.map((src, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.12, duration: 0.3 }}
                  className="chamfer-sm"
                >
                  <img
                    src={src}
                    alt={`Кадр ${i + 1}`}
                    style={{ animationDelay: `${i * 0.12}s` }}
                    className="develop aspect-[3/4] size-full object-cover"
                  />
                </motion.div>
              ))}
            </div>
            <ActionBar>
              <StudioButton>
                <span className="inline-flex items-center gap-2">
                  <Download size={18} aria-hidden="true" /> Скачать все кадры
                </span>
              </StudioButton>
              <StudioButton variant="quiet" onClick={onHome}>
                На главную
              </StudioButton>
            </ActionBar>
          </motion.div>
        ) : (
          <motion.div
            key="work"
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="grid justify-items-center gap-6 text-center"
          >
            <div className="chamfer ticks grain bg-canvas-raised grid aspect-[3/4] w-[62%] place-items-center overflow-hidden">
              <img
                src={scenario.cover}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-30 blur-md"
              />
              <div className="relative grid justify-items-center gap-3">
                <IrisLoader size={64} label="Собираем кадры" />
                <span className="font-display text-ink text-2xl tabular-nums">
                  {Math.max(done, 0)}/{scenario.frames}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <h1 className="font-display text-title text-ink text-[1.75rem]">
                {queued ? 'В очереди' : 'Собираем кадры'}
              </h1>
              <p className="text-body text-ink-muted mx-auto max-w-xs">
                Можно закрыть страницу — работа сохранится в кабинете.
              </p>
              <p className="text-caption text-ink-muted inline-flex items-center justify-center gap-2">
                <Clock size={14} aria-hidden="true" /> {scenario.eta}
              </p>
            </div>
            <FilmProgress frames={scenario.frames} done={Math.max(done, 0)} className="w-full" />
          </motion.div>
        )}
      </AnimatePresence>
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
