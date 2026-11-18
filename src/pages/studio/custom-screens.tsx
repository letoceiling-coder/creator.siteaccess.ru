import { Bot, Camera, Film, Music2, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { ApiError } from '@/features/auth/http.ts'
import { useSession } from '@/features/auth/session.ts'
import { heroDeck } from '@/features/catalog/data.ts'
import { createSongJob } from '@/features/jobs/api.ts'
import { usePaths } from '@/features/platform/use-paths.ts'
import {
  approveScenario,
  customTarget,
  getScenario,
  isSongPlan,
  isVideoPlan,
  replyScenario,
  startScenario,
  type Scenario,
  type ScenarioKind,
} from '@/features/scenarios/api.ts'
import { cn } from '@/shared/cn.ts'

const enter = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }
const IDEA_MAX = 800

const kinds: {
  id: ScenarioKind
  title: string
  text: string
  icon: typeof Camera
  placeholder: string
}[] = [
  {
    id: 'photo',
    title: 'Фотосессия',
    text: '4 кадра с вами в главной роли',
    icon: Camera,
    placeholder:
      'Например: прогулка по ночному Токио под неоновыми вывесками, я в длинном пальто, кадры как из кино',
  },
  {
    id: 'video',
    title: 'Видео',
    text: 'Ролик из 4 сцен и музыка',
    icon: Film,
    placeholder:
      'Например: я стою на крыше небоскрёба на рассвете, камера облетает вокруг, внизу просыпается город',
  },
  {
    id: 'song',
    title: 'Песня',
    text: 'Текст и музыка с вокалом',
    icon: Music2,
    placeholder: 'Например: песня-поздравление для мамы на юбилей, тёплая и немного весёлая',
  },
]

const songChips = {
  Жанр: ['поп', 'рок', 'рэп', 'лирическая баллада', 'электроника', 'джаз'],
  Настроение: ['весёлая', 'тёплая', 'грустная', 'торжественная', 'энергичная'],
  Голос: ['женский', 'мужской'],
  Язык: ['русский', 'английский'],
} as const

function Label({ children }: { children: string }) {
  return (
    <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
      <span className="bg-accent h-px w-5" aria-hidden="true" />
      {children}
    </p>
  )
}

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Не удалось связаться с агентом'

/** Карточка-приглашение «Свой сюжет» для главной и каталогов. */
export function CustomCta({ className }: { className?: string }) {
  const navigate = useNavigate()
  const paths = usePaths()
  return (
    <section className={cn('px-4 md:px-6', className)}>
      <div className="chamfer ticks grain bg-canvas-raised grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="grid content-start gap-3 p-6">
          <span className="text-caption tracking-label text-accent flex items-center gap-2 uppercase">
            <Sparkles size={14} aria-hidden="true" /> Свой сюжет
          </span>
          <h2 className="font-display text-title text-ink text-balance">
            Ничего не подошло? Опишите свою идею
          </h2>
          <p className="text-body text-ink-muted">
            Агент студии превратит её в сценарий фотосессии, видео или песни, улучшит и даст на
            согласование. Генерация — только после вашего «да».
          </p>
          <StudioButton
            arrow
            className="justify-self-start"
            onClick={() => void navigate(paths.custom)}
          >
            Придумать свой сюжет
          </StudioButton>
        </div>
        <div className="relative hidden min-h-48 md:block">
          <img
            src={heroDeck[2]}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
        </div>
      </div>
    </section>
  )
}

function Bubble({ role, text }: { role: 'user' | 'agent'; text: string }) {
  const agent = role === 'agent'
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enter}
      className={cn('flex gap-2', agent ? 'justify-start' : 'justify-end')}
    >
      {agent ? (
        <span className="bg-accent-fill text-accent-ink chamfer-sm grid size-9 shrink-0 place-items-center">
          <Bot size={18} aria-hidden="true" />
        </span>
      ) : null}
      <p
        className={cn(
          'text-body max-w-[85%] px-4 py-3 break-words whitespace-pre-line',
          agent ? 'chamfer-sm bg-canvas-raised text-ink' : 'bg-accent-fill/15 text-ink',
        )}
      >
        {text}
      </p>
    </motion.li>
  )
}

function PlanCard({
  scenario,
  musicChoice,
  onMusic,
}: {
  scenario: Scenario
  musicChoice: number | null
  onMusic: (i: number | null) => void
}) {
  const plan = scenario.plan
  if (!plan) return null
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enter}
      className="chamfer ticks bg-canvas-raised grid gap-4 p-5"
      aria-label="План на согласование"
    >
      <div className="grid gap-1">
        <Label>{scenario.status === 'approved' ? 'Согласовано' : 'План на согласование'}</Label>
        <h2 className="font-display text-ink text-2xl">{plan.title}</h2>
        <p className="text-body text-ink-muted">{plan.summary}</p>
      </div>
      {isSongPlan(plan) ? (
        <>
          <p className="text-caption text-ink-muted">
            {plan.genre} · {plan.vocal === 'male' ? 'мужской вокал' : 'женский вокал'} ·{' '}
            {plan.language === 'en' ? 'на английском' : 'на русском'} · {plan.bpm} BPM · около 2
            минут
          </p>
          <pre className="font-body text-body text-ink bg-canvas-sunken overflow-x-auto p-4 whitespace-pre-wrap">
            {plan.lyrics}
          </pre>
        </>
      ) : (
        <ol className="grid gap-2">
          {plan.shots.map((shot, i) => (
            <li key={shot.ru} className="chamfer-sm bg-canvas-sunken text-ink flex gap-3 px-4 py-3">
              <span className="text-accent font-display tabular-nums">0{i + 1}</span>
              <span>{shot.ru}</span>
            </li>
          ))}
        </ol>
      )}
      {isVideoPlan(plan) && plan.music.length ? (
        <fieldset className="grid gap-1" disabled={scenario.status === 'approved'}>
          <legend className="text-caption tracking-label text-ink-muted mb-1 uppercase">
            Фоновая музыка
          </legend>
          {[...plan.music.map((m, i) => ({ i, label: m.ru })), { i: -1, label: 'Без музыки' }].map(
            ({ i, label }) => (
              <label key={i} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="music"
                  checked={(musicChoice ?? -1) === i}
                  onChange={() => onMusic(i < 0 ? null : i)}
                />
                <span className="text-ink">{label}</span>
              </label>
            ),
          )}
        </fieldset>
      ) : null}
    </motion.section>
  )
}

export function CustomScreen({
  scenarioId,
  onCreate,
  onJob,
  onLogin,
}: {
  scenarioId?: string
  onCreate: (scenario: Scenario) => void
  onJob: (jobId: string) => void
  onLogin: () => void
}) {
  const session = useSession()
  const navigate = useNavigate()
  const paths = usePaths()
  const [kind, setKind] = useState<ScenarioKind>('photo')
  const [idea, setIdea] = useState('')
  const [chips, setChips] = useState<Record<string, string>>({})
  const [scenario, setScenario] = useState<Scenario>()
  const [loading, setLoading] = useState(Boolean(scenarioId))
  const [thinking, setThinking] = useState(false)
  const [reply, setReply] = useState('')
  const [music, setMusic] = useState<number | null>(0)
  const [error, setError] = useState<string>()
  const end = useRef<HTMLDivElement>(null)

  // Экран пересоздаётся для каждого сюжета (key в CustomPage): загружаем один раз.
  useEffect(() => {
    if (!scenarioId) return
    let alive = true
    getScenario(scenarioId)
      .then((s) => alive && setScenario(s))
      .catch((e: unknown) => alive && setError(errorText(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [scenarioId])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [scenario?.messages.length, thinking])

  const meta = kinds.find((k) => k.id === (scenario?.kind ?? kind)) ?? kinds[0]!

  async function start() {
    const extra = Object.entries(chips)
      .map(([k, v]) => `${k}: ${v}`)
      .join('. ')
    const text = kind === 'song' && extra ? `${idea.trim()}. ${extra}.` : idea.trim()
    setThinking(true)
    setError(undefined)
    try {
      const s = await startScenario(kind, text)
      setScenario(s)
      void navigate(paths.customItem(s.id), { replace: true })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setThinking(false)
    }
  }

  async function send() {
    if (!scenario || !reply.trim()) return
    setThinking(true)
    setError(undefined)
    try {
      setScenario(await replyScenario(scenario.id, reply.trim()))
      setReply('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setThinking(false)
    }
  }

  async function approve() {
    if (!scenario) return
    setThinking(true)
    setError(undefined)
    try {
      const s =
        scenario.status === 'approved'
          ? scenario
          : await approveScenario(scenario.id, scenario.kind === 'video' ? music : undefined)
      setScenario(s)
      if (s.kind === 'song') {
        const job = await createSongJob(customTarget(s.id))
        await session.refresh()
        onJob(job.id)
      } else onCreate(s)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setThinking(false)
    }
  }

  if (loading)
    return (
      <div className="grid min-h-64 place-items-center">
        <IrisLoader size={48} label="Загружаем сюжет" />
      </div>
    )

  const balance = session.me?.user.balance ?? 0
  const cost = scenario?.cost
  const short = cost !== undefined && balance < cost

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 pt-6 pb-16 md:px-6 [&>*]:min-w-0">
      <div className="grid gap-2">
        <Label>Свой сюжет</Label>
        <h1 className="font-display text-title text-ink text-[2rem] text-balance">
          {scenario ? meta.title : 'Опишите идею — агент сделает сценарий'}
        </h1>
        {!scenario ? (
          <p className="text-body text-ink-muted">
            Агент улучшит идею, при необходимости задаст вопросы и покажет план. Генерация начнётся
            только после того, как вы его согласуете.
          </p>
        ) : null}
      </div>

      {!scenario ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Что создать">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  'chamfer-sm grid min-h-11 grid-cols-[auto_1fr] items-center gap-3 p-4 text-left transition-colors duration-[140ms]',
                  kind === k.id
                    ? 'bg-accent-fill text-accent-ink'
                    : 'bg-canvas-raised text-ink hover:bg-canvas-overlay',
                )}
              >
                <k.icon size={22} aria-hidden="true" />
                <span className="grid">
                  <span className="font-display text-lg">{k.title}</span>
                  <span
                    className={cn('text-caption', kind === k.id ? 'opacity-85' : 'text-ink-muted')}
                  >
                    {k.text}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="flex justify-between gap-2">
              <span className="text-caption text-ink-muted">
                {kind === 'song' ? 'О чём песня' : 'Ваша идея'}
              </span>
              <span className="text-caption text-ink-muted tabular-nums">
                {idea.length} / {IDEA_MAX}
              </span>
            </span>
            <textarea
              className="border-line bg-canvas text-ink min-h-36 border p-3"
              value={idea}
              maxLength={IDEA_MAX}
              placeholder={meta.placeholder}
              onChange={(e) => setIdea(e.target.value)}
            />
          </label>
          {kind === 'song' ? (
            <div className="grid gap-3">
              {Object.entries(songChips).map(([group, values]) => (
                <div key={group} className="grid gap-1">
                  <span className="text-caption text-ink-muted">{group} (необязательно)</span>
                  <div className="flex flex-wrap gap-2">
                    {values.map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={chips[group] === v}
                        onClick={() =>
                          setChips((c) => {
                            const next = { ...c }
                            if (next[group] === v) delete next[group]
                            else next[group] = v
                            return next
                          })
                        }
                        className={cn(
                          'chamfer-sm min-h-11 px-4 transition-colors duration-[140ms]',
                          chips[group] === v
                            ? 'bg-accent-fill text-accent-ink'
                            : 'bg-canvas-raised text-ink hover:bg-canvas-overlay',
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-caption text-ink-muted flex gap-2">
            <ShieldCheck size={16} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
            Без откровенных и эротических сцен, насилия, наркотиков, экстремизма и известных людей.
            Такие идеи агент не возьмёт в работу.
          </p>
          {session.status === 'user' ? (
            <StudioButton
              arrow
              disabled={thinking || idea.trim().length < 5}
              onClick={() => void start()}
            >
              {thinking ? 'Агент думает…' : 'Отправить агенту'}
            </StudioButton>
          ) : (
            <StudioButton arrow onClick={onLogin}>
              Войти и придумать сюжет
            </StudioButton>
          )}
        </>
      ) : (
        <>
          <ul className="grid gap-3" aria-label="Переписка с агентом" aria-live="polite">
            {scenario.messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
          </ul>
          <PlanCard scenario={scenario} musicChoice={music} onMusic={setMusic} />
          <AnimatePresence>
            {thinking ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3"
              >
                <IrisLoader size={28} label="Агент думает" />
                <span className="text-caption text-ink-muted">Агент думает — до минуты…</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {scenario.status !== 'approved' ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-caption text-ink-muted">
                  {scenario.status === 'asking'
                    ? 'Ваш ответ агенту'
                    : 'Что изменить? (необязательно)'}
                </span>
                <textarea
                  className="border-line bg-canvas text-ink min-h-24 border p-3"
                  value={reply}
                  maxLength={IDEA_MAX}
                  placeholder={
                    scenario.status === 'asking'
                      ? 'Ответьте на вопрос'
                      : 'Например: добавь больше снега и тёплый свет фонарей'
                  }
                  onChange={(e) => setReply(e.target.value)}
                />
              </label>
              <StudioButton
                variant="outline"
                disabled={thinking || !reply.trim()}
                onClick={() => void send()}
              >
                <span className="inline-flex items-center gap-2">
                  <Send size={16} aria-hidden="true" />
                  {scenario.status === 'asking' ? 'Ответить' : 'Отправить правку'}
                </span>
              </StudioButton>
            </div>
          ) : null}
          {scenario.plan ? (
            <div className="grid gap-2">
              {short ? (
                <Alert tone="danger" title="Не хватает токенов">
                  Нужно {cost}, на балансе {balance}. Пополните баланс в кабинете.
                </Alert>
              ) : null}
              <StudioButton arrow disabled={thinking || short} onClick={() => void approve()}>
                {scenario.kind === 'song'
                  ? `${scenario.status === 'approved' ? 'Создать песню' : 'Согласовать и создать песню'} · ${cost} ток.`
                  : scenario.status === 'approved'
                    ? 'Загрузить фото и создать'
                    : 'Согласовать и загрузить фото'}
              </StudioButton>
              {scenario.kind !== 'song' ? (
                <p className="text-caption text-ink-muted">
                  Стоимость — {cost} токенов, спишутся при запуске после загрузки фото.
                </p>
              ) : null}
            </div>
          ) : null}
          <StudioButton variant="quiet" onClick={() => void navigate(paths.custom)}>
            Начать новый сюжет
          </StudioButton>
        </>
      )}
      {error ? (
        <Alert tone="danger" title="Агент">
          {error}
        </Alert>
      ) : null}
      <div ref={end} />
    </div>
  )
}
