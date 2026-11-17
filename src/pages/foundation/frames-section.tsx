import { Play } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import walkYellow from '@/assets/playground/walk-yellow.jpg'
import cityNight from '@/assets/playground/city-night.jpg'
import portraitDay from '@/assets/playground/portrait-day.jpg'
import scenarioField from '@/assets/playground/scenario-field.jpg'
import scenarioRoom from '@/assets/playground/scenario-room.jpg'
import coatEditorial from '@/assets/playground/coat-editorial.jpg'
import galleryLinen from '@/assets/playground/gallery-linen.jpg'
import galleryStreet from '@/assets/playground/gallery-street.jpg'
import galleryStudio from '@/assets/playground/gallery-studio.jpg'
import galleryLook from '@/assets/playground/gallery-look.jpg'
import { Badge } from '@/components/ui/badge.tsx'
import { buttonClasses } from '@/components/ui/button-styles.ts'
import { Button } from '@/components/ui/button.tsx'
import { Progress } from '@/components/ui/progress.tsx'
import { SelectableCard } from '@/components/ui/card.tsx'
import { motionTokens } from '@/config/motion.ts'

const gallery = [
  {
    src: galleryLinen,
    alt: 'Цветочное платье и круглая сумка у моря',
    caption: 'Лён',
  },
  {
    src: galleryStreet,
    alt: 'Портрет в кожаной куртке и тёмных очках',
    caption: 'Улица',
  },
  {
    src: galleryStudio,
    alt: 'Голубая рубашка на красном складном стуле',
    caption: 'Фактура',
  },
  {
    src: galleryLook,
    alt: 'Фигура в полосатых брюках на зелёном фоне',
    caption: 'Цвет',
  },
] as const

const scenarios = [
  {
    id: 'field',
    title: 'Дневной свет',
    meta: 'Мягкий портрет, цветы на переднем плане',
    src: scenarioField,
    alt: 'Портрет в белой вышитой блузе среди цветов',
  },
  {
    id: 'room',
    title: 'Синяя стена',
    meta: 'Уличный кадр, джинсовая куртка',
    src: scenarioRoom,
    alt: 'Портрет в джинсовой куртке у синей стены',
  },
  {
    id: 'yellow',
    title: 'Жёлтая стена',
    meta: 'Крупный план, круглые очки',
    src: coatEditorial,
    alt: 'Крупный портрет у жёлтой стены, круглые очки',
  },
] as const

function Storyboard() {
  const [playing, setPlaying] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setPlaying(false), 2400)
    return () => window.clearTimeout(timer)
  }, [playing])

  return (
    <article className="border-line bg-canvas-raised shadow-raised overflow-hidden rounded-lg border">
      <div className="bg-canvas-sunken relative aspect-video">
        <img
          src={cityNight}
          alt="Городской горизонт в контровом закатном свете"
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <button
          type="button"
          aria-pressed={playing}
          className="bg-canvas-overlay text-ink absolute bottom-3 left-3 inline-flex min-h-11 items-center gap-2 rounded-md px-3"
          onClick={() => setPlaying((current) => !current)}
        >
          <Play aria-hidden="true" size={16} />
          {playing ? 'Идёт раскадровка' : 'Показать ход кадра'}
        </button>
      </div>
      <div className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-title text-ink">Город на закате</h3>
          <Badge tone="accent">Раскадровка</Badge>
        </div>
        <p className="text-caption text-ink-muted">
          Локальная отметка хода. Файл не воспроизводится и никуда не отправляется.
        </p>
        <div className="bg-canvas-sunken h-1 overflow-hidden rounded-full">
          <motion.div
            className="bg-accent-fill h-full origin-left"
            initial={false}
            animate={{ scaleX: playing ? 1 : 0 }}
            transition={{
              duration: reduceMotion || !playing ? 0 : 2.4,
              ease: [...motionTokens.ease.standard],
            }}
          />
        </div>
      </div>
    </article>
  )
}

function UploadSpecimen() {
  const urlRef = useRef<string | null>(null)
  const [shot, setShot] = useState<{ name: string; url: string } | null>(null)

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0]
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    if (!next) {
      urlRef.current = null
      setShot(null)
      return
    }
    const url = URL.createObjectURL(next)
    urlRef.current = url
    setShot({ name: next.name, url })
  }

  return (
    <div className="border-line bg-canvas-raised grid gap-4 rounded-lg border p-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center">
      <div className="bg-canvas-sunken relative aspect-square overflow-hidden rounded-md">
        {shot ? (
          <img src={shot.url} alt={shot.name} className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="text-caption text-ink-muted absolute inset-0 grid place-items-center px-2 text-center">
            1:1
          </span>
        )}
      </div>
      <div className="grid justify-items-start gap-2">
        <p className="text-body text-ink font-medium">Кадр на устройстве</p>
        <p className="text-caption text-ink-muted break-all">
          {shot ? shot.name : 'Файл остаётся в браузере. На сервер ничего не уходит.'}
        </p>
        <label htmlFor="local-shot" className={buttonClasses('secondary', 'sm')}>
          Выбрать кадр
        </label>
        <input
          id="local-shot"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onChange}
        />
      </div>
    </div>
  )
}

function GenerationSpecimen() {
  const [value, setValue] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setValue((current) => {
        if (current >= 100) {
          setRunning(false)
          return 100
        }
        return Math.min(100, current + 7)
      })
    }, motionTokens.duration.base * 1000)
    return () => window.clearInterval(timer)
  }, [running])

  return (
    <article className="border-line bg-canvas-overlay grid gap-4 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-display text-title text-ink">Ход сборки</h3>
          <p className="text-caption text-ink-muted">Шкала на этом экране. Запроса к модели нет.</p>
        </div>
        <Badge tone={value >= 100 ? 'success' : 'neutral'}>
          {value >= 100 ? 'Готово' : 'Ожидание'}
        </Badge>
      </div>
      <Progress value={value} label="Сборка превью" />
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setValue(0)
            setRunning(true)
          }}
        >
          {running ? 'Идёт сборка' : 'Показать ход'}
        </Button>
      </div>
    </article>
  )
}

export function FramesSection() {
  const [scenario, setScenario] = useState<(typeof scenarios)[number]['id']>('field')
  const galleryRef = useRef<HTMLDivElement>(null)
  const [galleryScrolls, setGalleryScrolls] = useState(false)

  useEffect(() => {
    const node = galleryRef.current
    if (!node) return
    const measure = () => setGalleryScrolls(node.scrollWidth > node.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-12">
      <article className="border-line bg-canvas-raised shadow-raised overflow-hidden rounded-lg border lg:col-span-7">
        <div className="bg-canvas-sunken relative aspect-[4/5] sm:aspect-[16/10]">
          <img
            src={walkYellow}
            alt="Полный рост в жёлтом костюме на открытой площадке"
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div className="grid gap-1">
            <p className="text-caption tracking-label text-ink-muted uppercase">Сессия 18</p>
            <h3 className="font-display text-title text-ink">Открытая площадка</h3>
          </div>
          <Badge>3:4 / 16:10</Badge>
        </div>
      </article>

      <div className="grid gap-4 lg:col-span-5">
        <Storyboard />
        <article className="border-line bg-canvas-raised overflow-hidden rounded-lg border">
          <div className="grid sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <div className="bg-canvas-sunken relative aspect-[3/4] sm:aspect-auto sm:min-h-40">
              <img
                src={portraitDay}
                alt="Студийный портрет в чёрном, рука в волосах"
                className="absolute inset-0 size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="grid content-between gap-3 p-4">
              <div className="grid gap-1">
                <Badge tone="success">Превью</Badge>
                <h3 className="font-display text-title text-ink">Студийный свет</h3>
              </div>
              <p className="text-caption text-ink-muted">
                Резерв 3:4 держит высоту, пока кадр ещё не пришёл.
              </p>
            </div>
          </div>
        </article>
      </div>

      <div
        ref={galleryRef}
        tabIndex={galleryScrolls ? 0 : undefined}
        aria-label="Галерея кадров"
        className="focus-visible:outline-focus min-w-0 overflow-x-auto overscroll-x-contain rounded-md lg:col-span-12 lg:overflow-visible"
      >
        <ul className="flex w-max snap-x snap-mandatory gap-3 pb-1 lg:grid lg:w-full lg:grid-cols-4">
          {gallery.map((item) => (
            <li key={item.caption} className="w-60 shrink-0 snap-start sm:w-64 lg:w-auto lg:shrink">
              <figure className="border-line bg-canvas-raised overflow-hidden rounded-lg border">
                <div className="bg-canvas-sunken relative aspect-[3/4]">
                  <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
                <figcaption className="text-caption text-ink px-3 py-3">{item.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
        {scenarios.map((item) => (
          <SelectableCard
            key={item.id}
            title={item.title}
            meta={item.meta}
            src={item.src}
            alt={item.alt}
            selected={scenario === item.id}
            onSelect={() => setScenario(item.id)}
          />
        ))}
      </div>
      <div className="grid content-start gap-4 lg:col-span-5">
        <UploadSpecimen />
        <GenerationSpecimen />
      </div>
    </div>
  )
}
