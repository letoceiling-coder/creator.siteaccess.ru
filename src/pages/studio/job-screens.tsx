import { Check, Clock, Download, ImagePlus, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ActionBar } from '@/components/studio/action-bar.tsx'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { FilmProgress } from '@/components/studio/film-progress.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { UploadSlot } from '@/components/studio/upload-slot.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  ApiError,
  cancelJob,
  checkPhoto,
  createJob,
  finalStatuses,
  getJob,
  listJobs,
  PHOTO_TYPES,
  type Job,
  type JobKind,
  type TimeOfDay,
} from '@/features/jobs/api.ts'
import { priceOf, useSession } from '@/features/auth/session.ts'
import { motions } from '@/features/jobs/motions.ts'
import { cn } from '@/shared/cn.ts'
import { OrderBanner, TopUp } from './payment-section.tsx'

/** Что создаём: фотосессию по сценарию или ролик по шаблону. */
export interface CreateTarget {
  kind: JobKind
  id: string
  title: string
  cover: string
  /** «5 кадров», «ролик 5 с» */
  output: string
  eta: string
  /** 2 — сюжет на двоих: по одному фото каждого человека. */
  people?: 1 | 2
  /** Сцены сценария для показа в мастере. */
  script?: string[]
}

function Label({ children }: { children: string }) {
  return (
    <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
      <span className="bg-accent h-px w-5" aria-hidden="true" />
      {children}
    </p>
  )
}

/* ───────────── Мастер ───────────── */

const outfits = ['Как в сценарии', 'Светлый костюм', 'Тёмное пальто']
const times: { id: TimeOfDay; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'dusk', label: 'Закат' },
  { id: 'night', label: 'Ночь' },
]

const durations = [
  { id: '5', label: '5 секунд' },
  { id: '10', label: '10 секунд' },
]

function ChoiceList({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: { id: string; label: string; hint?: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={label}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'chamfer-sm relative flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-left transition-colors duration-[140ms]',
              active ? 'bg-canvas-overlay text-ink' : 'bg-canvas-raised text-ink-muted',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`${label}-bar`}
                className="bg-accent-fill absolute inset-y-0 left-0 w-1"
              />
            ) : null}
            <span className="grid">
              <span>{item.label}</span>
              {item.hint ? <span className="text-caption text-ink-muted">{item.hint}</span> : null}
            </span>
            <motion.span
              initial={false}
              animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
              className="bg-accent-fill text-accent-ink grid size-6 shrink-0 place-items-center"
            >
              <Check size={14} aria-hidden="true" />
            </motion.span>
          </button>
        )
      })}
    </div>
  )
}

function StepRail({ step, names }: { step: number; names: string[] }) {
  return (
    <ol className="grid grid-cols-3 gap-1" aria-label="Шаги">
      {names.map((name, i) => (
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

interface Picked {
  file: File
  url: string
}

export function WizardScreen({
  target,
  onDone,
  onBack,
  onLogin,
  onWallet,
}: {
  target: CreateTarget
  onDone: (jobId: string) => void
  onBack: () => void
  onLogin: () => void
  onWallet: () => void
}) {
  const session = useSession()
  const animate = target.kind === 'animate'
  const pair = target.people === 2
  const slots = animate ? 1 : pair ? 2 : 3
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<(Picked | undefined)[]>(() =>
    Array.from({ length: slots }, () => undefined),
  )
  const [motionId, setMotionId] = useState('smile')
  const [duration, setDuration] = useState<5 | 10>(5)
  const [outfit, setOutfit] = useState(0)
  const [time, setTime] = useState<TimeOfDay>('day')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const urls = useRef(new Set<string>())
  const count = photos.filter(Boolean).length

  // Превью живут как object URL: освобождаем при уходе со страницы.
  useEffect(() => {
    const set = urls.current
    return () => set.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    // Проверка и раскладка по слотам — синхронно, чтобы ошибки сразу попали на экран.
    const problems: string[] = []
    const next = [...photos]
    for (const file of files) {
      const problem = checkPhoto(file)
      if (problem) {
        problems.push(problem)
        continue
      }
      const free = next.findIndex((p) => !p)
      if (free < 0) {
        problems.push(slots === 1 ? 'Нужно одно фото' : 'Можно не больше трёх фото')
        break
      }
      const url = URL.createObjectURL(file)
      urls.current.add(url)
      next[free] = { file, url }
    }
    setPhotos(next)
    setError(problems.length ? problems.join('. ') : undefined)
  }

  function remove(slot: number) {
    setPhotos((p) =>
      p.map((v, i) => {
        if (i === slot && v) {
          URL.revokeObjectURL(v.url)
          urls.current.delete(v.url)
          return undefined
        }
        return v
      }),
    )
  }

  const cost = priceOf(session.me, target.kind, animate ? duration : undefined)
  const balance = session.me?.user.balance ?? 0
  const short = cost !== undefined && balance < cost

  async function submit() {
    if (session.status !== 'user') {
      onLogin()
      return
    }
    setSending(true)
    setError(undefined)
    try {
      const job = await createJob({
        kind: target.kind,
        target: animate ? motionId : target.id,
        outfit,
        time,
        duration: animate ? duration : undefined,
        photos: photos.filter((p): p is Picked => Boolean(p)).map((p) => p.file),
      })
      void session.refresh()
      onDone(job.id)
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Не удалось отправить задачу. Попробуйте ещё раз.',
      )
      setSending(false)
    }
  }

  const canNext =
    step === 0
      ? count >= (pair ? 2 : 1)
      : step === 2
        ? consent && !sending && (session.status !== 'user' || !short)
        : true

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 pt-4 md:px-6">
      <StepRail
        step={step}
        names={['Фото', animate ? 'Движение' : pair ? 'Сценарий' : 'Образ', 'Проверка']}
      />
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        multiple={!animate}
        hidden
        onChange={pick}
        data-testid="photo-input"
      />
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
                  {pair
                    ? 'Два фото: первое — первый человек, второе — второй. На каждом одно лицо, хорошо видно и не закрыто.'
                    : animate
                      ? 'Один снимок, который нужно оживить. Подойдут и старые фото, переснятые на телефон. Лицо должно быть различимо.'
                      : 'От одного до трёх снимков. Лицо хорошо видно, без сильных фильтров, очков и перекрытий. Лучше разные ракурсы.'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <UploadSlot
                    key={i}
                    index={i}
                    src={p?.url}
                    caption={pair ? (i === 0 ? 'Первый' : 'Второй') : undefined}
                    onAdd={() => input.current?.click()}
                    onRemove={() => remove(i)}
                  />
                ))}
              </div>
              <StudioButton
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={count === slots}
              >
                <span className="inline-flex items-center gap-2">
                  <ImagePlus size={18} aria-hidden="true" /> Выбрать фото
                </span>
              </StudioButton>
              <p className="text-caption text-ink-muted">JPEG, PNG или WebP, до 15 МБ каждое.</p>
            </>
          ) : null}

          {step === 1 && animate ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Движение</h1>
              <ChoiceList
                label="Движение"
                items={motions}
                value={motionId}
                onChange={setMotionId}
              />
              <div className="grid gap-2">
                <Label>Длительность</Label>
                <ApertureTabs
                  label="Длительность"
                  items={durations}
                  value={String(duration)}
                  onChange={(id) => setDuration(id === '10' ? 10 : 5)}
                />
              </div>
            </>
          ) : null}

          {step === 1 && pair ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Сценарий</h1>
              <ol className="grid gap-2">
                {(target.script ?? []).map((scene, i) => (
                  <li
                    key={scene}
                    className="chamfer-sm bg-canvas-raised text-ink flex min-h-12 items-center gap-3 px-4"
                  >
                    <span className="text-accent font-display tabular-nums">0{i + 1}</span>
                    {scene}
                  </li>
                ))}
              </ol>
              <p className="text-caption text-ink-muted">
                Образы и место действия заданы сюжетом. Оба человека будут в каждой сцене.
              </p>
            </>
          ) : null}

          {step === 1 && !animate && !pair ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Образ</h1>
              <div className="grid gap-2">
                <Label>Одежда</Label>
                <ChoiceList
                  label="Одежда"
                  items={outfits.map((name, i) => ({ id: String(i), label: name }))}
                  value={String(outfit)}
                  onChange={(id) => setOutfit(Number(id))}
                />
              </div>
              {target.kind === 'photo' ? (
                <div className="grid gap-2">
                  <Label>Время суток</Label>
                  <ApertureTabs label="Время суток" items={times} value={time} onChange={setTime} />
                </div>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="font-display text-title text-ink text-[1.75rem]">Проверьте задачу</h1>
              <div className="chamfer ticks bg-canvas-raised grid gap-5 p-5">
                <div className="flex gap-3">
                  <img
                    src={target.cover}
                    alt=""
                    className="chamfer-sm aspect-[3/4] w-20 object-cover"
                  />
                  <div className="grid content-center gap-1">
                    <span className="text-caption tracking-label text-accent uppercase">
                      {animate ? 'Оживление' : target.kind === 'video' ? 'Видеошаблон' : 'Сценарий'}
                    </span>
                    <span className="font-display text-ink text-xl">{target.title}</span>
                    <span className="text-caption text-ink-muted">
                      {animate ? `ролик ${duration} секунд` : target.output}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {photos.map((p, i) =>
                    p ? (
                      <img
                        key={i}
                        src={p.url}
                        alt={`Фото ${i + 1}`}
                        className="chamfer-sm size-14 object-cover"
                      />
                    ) : null,
                  )}
                </div>
                <dl className="divide-line border-line text-body grid divide-y border-y">
                  {(animate
                    ? [
                        ['Движение', motions.find((m) => m.id === motionId)?.label ?? ''],
                        ['Длительность', `${duration} с`],
                        ['Ожидание', duration === 10 ? 'около 4 минут' : 'около 2 минут'],
                      ]
                    : [
                        ...(pair ? [] : [['Одежда', outfits[outfit] ?? '']]),
                        ...(target.kind === 'photo'
                          ? [['Время', times.find((t) => t.id === time)?.label ?? '']]
                          : []),
                        ['Ожидание', target.eta],
                      ]
                  )
                    .concat(
                      cost !== undefined
                        ? [
                            ['Стоимость', `${cost} токенов`],
                            ['Ваш баланс', `${balance} токенов`],
                          ]
                        : [],
                    )
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between py-3">
                        <dt className="text-ink-muted">{k}</dt>
                        <dd className="text-ink">{v}</dd>
                      </div>
                    ))}
                </dl>
              </div>
              <Checkbox
                label={
                  pair
                    ? 'На фото я и человек, который согласен на этот ролик. Мы оба согласны на обработку фото.'
                    : 'Это мои фото или у меня есть согласие человека на снимках. Я согласен на их обработку для создания результата.'
                }
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <p className="text-caption text-ink-muted">
                Исходные фото удаляются сразу после обработки, результаты — через 7 дней. Все
                результаты созданы ИИ, сходство зависит от качества снимков.
              </p>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {error ? (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      ) : null}

      {step === 2 && session.status === 'guest' ? (
        <Alert tone="info" title="Нужен вход">
          Создавать фотосессии и видео можно после входа. Новым пользователям — бонусные токены.
        </Alert>
      ) : null}
      {step === 2 && session.status === 'user' && short ? (
        <div className="grid gap-2">
          <Alert tone="danger" title="Не хватает токенов">
            Нужно {cost}, на балансе {balance}. Пополните баланс или пригласите друга — за каждого
            начисляются токены.
          </Alert>
          <StudioButton variant="outline" onClick={onWallet}>
            Пополнить баланс
          </StudioButton>
        </div>
      ) : null}

      <ActionBar>
        <StudioButton
          arrow={!sending}
          disabled={!canNext}
          onClick={() => (step === 2 ? void submit() : setStep(step + 1))}
        >
          {sending
            ? 'Отправляем…'
            : step < 2
              ? 'Дальше'
              : session.status === 'guest'
                ? 'Войти и создать'
                : cost
                  ? `Создать · ${cost} токенов`
                  : 'Создать'}
        </StudioButton>
        <StudioButton
          variant="quiet"
          disabled={sending}
          onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
        >
          Назад
        </StudioButton>
      </ActionBar>
    </div>
  )
}

/* ───────────── Задача ───────────── */

const statusTitle: Record<Job['status'], string> = {
  queued: 'В очереди',
  running: 'Создаём',
  done: 'Готово',
  failed: 'Не получилось',
  cancelled: 'Задача отменена',
  expired: 'Срок хранения истёк',
}

function useJob(id: string) {
  const [job, setJob] = useState<Job>()
  const [error, setError] = useState<string>()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    let timer = 0
    async function poll() {
      try {
        const next = await getJob(id)
        if (!alive) return
        setJob(next)
        setError(undefined)
        if (!finalStatuses.includes(next.status)) timer = window.setTimeout(poll, 3_000)
      } catch (e) {
        if (!alive) return
        if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
          setMissing(true)
          return
        }
        setError(e instanceof ApiError ? e.message : 'Нет связи с сервером')
        timer = window.setTimeout(poll, 6_000)
      }
    }
    void poll()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [id])

  return { job, setJob, error, missing }
}

export function JobScreen({
  jobId,
  describe,
  onRetry,
  onCabinet,
}: {
  jobId: string
  describe: (kind: JobKind, target: string) => { title: string; cover: string } | undefined
  onRetry: (kind: JobKind, target: string) => void
  onCabinet: () => void
}) {
  const { job, setJob, error, missing } = useJob(jobId)
  const [cancelling, setCancelling] = useState(false)

  if (missing) {
    return (
      <div className="mx-auto grid max-w-xl gap-6 px-4 pt-8 md:px-6">
        <Alert tone="danger" title="Задача не найдена">
          Войдите в аккаунт, в котором создавали задачу, или откройте список своих задач в кабинете.
        </Alert>
        <StudioButton variant="outline" onClick={onCabinet}>
          В кабинет
        </StudioButton>
      </div>
    )
  }

  const meta = job ? describe(job.kind, job.target) : undefined
  const title = meta?.title ?? 'Задача'

  async function cancel() {
    setCancelling(true)
    try {
      setJob(await cancelJob(jobId))
    } finally {
      setCancelling(false)
    }
  }

  if (!job) {
    return (
      <div className="grid min-h-64 place-items-center gap-4 px-4 pt-16 text-center">
        {error ? (
          <Alert tone="danger" title="Нет связи">
            {error}
          </Alert>
        ) : (
          <IrisLoader size={48} label="Загружаем задачу" />
        )}
      </div>
    )
  }

  const working = job.status === 'queued' || job.status === 'running'

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 pt-8 md:px-6">
      <AnimatePresence mode="wait" initial={false}>
        {job.status === 'done' ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-6"
          >
            <div className="grid gap-2">
              <Label>Готово</Label>
              <h1 className="font-display text-title text-ink text-[1.75rem]">{title}</h1>
              <p className="text-caption text-ink-muted">
                Создано ИИ. Файлы хранятся 7 дней — скачайте те, что понравились.
              </p>
            </div>
            <div className={cn('grid gap-2', job.kind === 'photo' && 'grid-cols-2')}>
              {job.results.map((r, i) =>
                r.type === 'video' ? (
                  <div key={r.src} className="grid gap-2">
                    <video
                      src={r.src}
                      poster={r.poster}
                      controls
                      playsInline
                      loop
                      className="chamfer bg-canvas-sunken w-full"
                      style={{ aspectRatio: `${r.width} / ${r.height}`, maxHeight: '70dvh' }}
                    />
                    <a
                      href={r.download}
                      download
                      className="chamfer-sm bg-canvas-raised text-ink hover:bg-canvas-overlay inline-flex min-h-11 items-center justify-center gap-2"
                    >
                      <Download size={16} aria-hidden="true" /> Скачать ролик
                    </a>
                  </div>
                ) : (
                  <motion.figure
                    key={r.src}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.1, duration: 0.3 }}
                    className="chamfer-sm relative"
                  >
                    <img
                      src={r.src}
                      alt={`Кадр ${i + 1}`}
                      width={r.width}
                      height={r.height}
                      style={{ animationDelay: `${i * 0.12}s` }}
                      className="develop aspect-[3/4] size-full object-cover"
                    />
                    {r.label ? (
                      <figcaption className="tracking-label absolute top-2 left-2 bg-black/50 px-2 py-1 text-[11px] text-white uppercase backdrop-blur-sm">
                        {r.label}
                      </figcaption>
                    ) : null}
                    <a
                      href={r.download}
                      download={`kadr-${i + 1}.jpg`}
                      aria-label={`Скачать кадр ${i + 1}`}
                      className="absolute right-0 bottom-0 grid size-11 place-items-center text-white"
                    >
                      <span className="grid size-8 place-items-center bg-black/60 backdrop-blur-sm">
                        <Download size={16} aria-hidden="true" />
                      </span>
                    </a>
                  </motion.figure>
                ),
              )}
            </div>
            <ActionBar>
              <StudioButton variant="outline" onClick={onCabinet}>
                Все мои задачи
              </StudioButton>
            </ActionBar>
          </motion.div>
        ) : working ? (
          <motion.div
            key="work"
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="grid justify-items-center gap-6 text-center"
          >
            <div className="chamfer ticks grain bg-canvas-raised relative grid aspect-[3/4] w-[62%] max-w-72 place-items-center overflow-hidden">
              {meta ? (
                <img
                  src={meta.cover}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-30 blur-md"
                />
              ) : null}
              <div className="relative grid justify-items-center gap-3">
                <IrisLoader size={64} label={statusTitle[job.status]} />
                <span className="font-display text-ink text-2xl tabular-nums">
                  {job.done}/{job.total}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <h1 className="font-display text-title text-ink text-[1.75rem]">
                {statusTitle[job.status]}
              </h1>
              <p className="text-body text-ink-muted mx-auto max-w-xs">
                {job.status === 'queued'
                  ? `Перед вами задач: ${Math.max(job.position - 1, 0)}. `
                  : null}
                Можно закрыть страницу — задача сохранится в кабинете.
              </p>
              <p className="text-caption text-ink-muted inline-flex items-center justify-center gap-2">
                <Clock size={14} aria-hidden="true" /> {title}
              </p>
            </div>
            <FilmProgress frames={job.total} done={job.done} className="w-full" />
            {error ? <p className="text-caption text-danger">{error}</p> : null}
            <StudioButton variant="quiet" disabled={cancelling} onClick={() => void cancel()}>
              <span className="inline-flex items-center gap-2">
                <X size={16} aria-hidden="true" /> Отменить
              </span>
            </StudioButton>
          </motion.div>
        ) : (
          <motion.div key="end" className="grid gap-6">
            <h1 className="font-display text-title text-ink text-[1.75rem]">
              {statusTitle[job.status]}
            </h1>
            {job.status === 'failed' ? (
              <Alert tone="danger" title="Ошибка генерации">
                {job.error ?? 'Попробуйте ещё раз.'}
              </Alert>
            ) : null}
            <StudioButton onClick={() => onRetry(job.kind, job.target)}>
              <span className="inline-flex items-center gap-2">
                <RotateCcw size={16} aria-hidden="true" /> Создать заново
              </span>
            </StudioButton>
            <StudioButton variant="quiet" onClick={onCabinet}>
              Все мои задачи
            </StudioButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────── Кабинет ───────────── */

const reasonTitle: Record<string, string> = {
  signup: 'Бонус за регистрацию',
  invitee: 'Бонус по приглашению',
  daily: 'Бесплатные токены на сегодня',
  referral: 'Награда за друга',
  job: 'Списание',
  refund: 'Возврат',
  admin: 'Начисление',
  purchase: 'Покупка',
}

interface WalletRow {
  id: number
  delta: number
  reason: string
  note?: string
  createdAt: number
}

const dateTime = (ts: number) =>
  new Date(ts).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export function CabinetScreen({
  describe,
  onOpen,
  onCatalog,
  onLogin,
  onAdmin,
}: {
  describe: (kind: JobKind, target: string) => { title: string; cover: string } | undefined
  onOpen: (id: string) => void
  onCatalog: () => void
  onLogin: () => void
  onAdmin: () => void
}) {
  const session = useSession()
  const me = session.me
  const [orderId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('order')
    return id && /^[0-9a-f]{24}$/.test(id) ? id : undefined
  })
  const [jobs, setJobs] = useState<Job[]>()
  const [history, setHistory] = useState<WalletRow[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (session.status !== 'user') return
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
    fetch('/api/wallet', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ history: WalletRow[] }>)
      .then((d) => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
  }, [session.status])

  if (session.status === 'loading') {
    return (
      <div className="grid min-h-64 place-items-center">
        <IrisLoader size={48} label="Загружаем кабинет" />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="mx-auto grid max-w-xl gap-6 px-4 pt-8 pb-16 md:px-6">
        <div className="grid gap-2">
          <Label>Кабинет</Label>
          <h1 className="font-display text-title text-ink text-[2rem]">Войдите в аккаунт</h1>
          <p className="text-body text-ink-muted">
            В кабинете — баланс токенов, ваши фотосессии и видео, приглашения для друзей.
          </p>
        </div>
        <StudioButton arrow onClick={onLogin}>
          Войти или зарегистрироваться
        </StudioButton>
      </div>
    )
  }

  async function share() {
    if (!me) return
    const text =
      'Фотосессии и видео с собой в главной роли — попробуй, по ссылке будут бонусные токены'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AI Creative Studio', text, url: me.referralUrl })
        return
      }
      await navigator.clipboard.writeText(me.referralUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // пользователь закрыл окно «Поделиться»
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 pt-6 pb-16 md:px-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Label>Кабинет</Label>
          <h1 className="font-display text-title text-ink text-[2rem]">{me.user.name}</h1>
          <p className="text-caption text-ink-muted">
            {me.user.email ??
              (me.user.providers.length ? `Вход: ${me.user.providers.join(', ')}` : '')}
          </p>
        </div>
        <div className="flex gap-2">
          {me.user.role === 'admin' ? (
            <StudioButton variant="outline" onClick={onAdmin}>
              Админка
            </StudioButton>
          ) : null}
          <StudioButton variant="quiet" onClick={() => void session.logout()}>
            Выйти
          </StudioButton>
        </div>
      </div>

      {orderId ? <OrderBanner orderId={orderId} /> : null}

      <section className="chamfer ticks grain bg-canvas-raised grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid gap-1">
          <span className="text-caption tracking-label text-ink-muted uppercase">Баланс</span>
          <span className="font-display text-ink text-4xl tabular-nums">
            {me.user.balance} <span className="text-accent text-xl">токенов</span>
          </span>
          <span className="text-caption text-ink-muted">
            Фотосессия — {me.prices.photo}, видео — {me.prices.video}, оживление —{' '}
            {me.prices.animate5}–{me.prices.animate10}. При нулевом балансе каждый день —{' '}
            {me.bonuses.daily} бесплатно.
          </span>
        </div>
        <StudioButton arrow onClick={onCatalog}>
          Создать
        </StudioButton>
      </section>

      <section className="grid gap-3">
        <Label>Пригласить друга</Label>
        <p className="text-body text-ink-muted">
          Друг получит {me.bonuses.invitee} токенов при регистрации, а вы — {me.bonuses.referrer},
          когда он создаст первую работу.
        </p>
        <div className="flex min-w-0 flex-wrap gap-2">
          <code className="chamfer-sm bg-canvas-sunken text-ink min-h-11 min-w-0 flex-1 basis-48 truncate px-4 py-3 text-sm">
            {me.referralUrl}
          </code>
          <StudioButton variant="outline" onClick={() => void share()}>
            {copied ? 'Скопировано' : 'Поделиться'}
          </StudioButton>
        </div>
      </section>

      <TopUp />

      <section className="grid gap-3">
        <Label>Мои работы</Label>
        {jobs === undefined ? (
          <IrisLoader size={32} label="Загружаем задачи" />
        ) : jobs.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-body text-ink-muted">Пока ничего не создано.</p>
            <StudioButton variant="outline" onClick={onCatalog}>
              Выбрать сюжет
            </StudioButton>
          </div>
        ) : (
          <ul className="grid gap-2">
            {jobs.map((j) => {
              const meta = describe(j.kind, j.target)
              return (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(j.id)}
                    className="chamfer-sm bg-canvas-raised hover:bg-canvas-overlay flex min-h-16 w-full items-center gap-3 p-2 text-left transition-colors duration-[140ms]"
                  >
                    {meta ? (
                      <img src={meta.cover} alt="" className="chamfer-sm size-12 object-cover" />
                    ) : null}
                    <span className="grid flex-1 gap-0.5">
                      <span className="text-ink">{meta?.title ?? j.target}</span>
                      <span className="text-caption text-ink-muted">
                        {j.kind === 'photo' ? 'Фото' : 'Видео'} · {dateTime(j.createdAt)}
                        {j.cost ? ` · ${j.cost} ток.` : ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'text-caption tracking-label px-2 uppercase',
                        j.status === 'done' ? 'text-success' : 'text-ink-muted',
                      )}
                    >
                      {statusTitle[j.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {history.length ? (
        <section className="grid gap-3">
          <Label>История токенов</Label>
          <ul className="divide-line border-line grid divide-y border-y">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-3">
                <span className="grid">
                  <span className="text-ink">{h.note ?? reasonTitle[h.reason] ?? h.reason}</span>
                  <span className="text-caption text-ink-muted">{dateTime(h.createdAt)}</span>
                </span>
                <span
                  className={cn(
                    'font-display tabular-nums',
                    h.delta > 0 ? 'text-success' : 'text-ink-muted',
                  )}
                >
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
