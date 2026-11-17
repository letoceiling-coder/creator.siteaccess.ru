import { Info, Search } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import portraitNorth from '@/assets/playground/portrait-north.jpg'
import railStudio from '@/assets/playground/rail-studio.jpg'
import { useTheme } from '@/app/use-theme.ts'
import { Alert } from '@/components/ui/alert.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  FeatureCard,
  GlassCard,
  InteractiveCard,
  MediaCard,
  StandardCard,
} from '@/components/ui/card.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { RadioGroup, SegmentedControl } from '@/components/ui/choice-controls.tsx'
import { Dropdown } from '@/components/ui/dropdown.tsx'
import { EmptyState } from '@/components/ui/empty-state.tsx'
import { Modal } from '@/components/ui/modal.tsx'
import { Progress } from '@/components/ui/progress.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Spinner } from '@/components/ui/spinner.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { Tabs } from '@/components/ui/tabs.tsx'
import { TextArea } from '@/components/ui/text-area.tsx'
import { TextField } from '@/components/ui/text-field.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { useToast } from '@/components/ui/use-toast.ts'
import { motionTokens } from '@/config/motion.ts'
import { displayNameResolver, type DisplayNameValues } from '@/shared/forms.ts'
import { FramesSection } from './foundation/frames-section.tsx'
import { PlaygroundNav } from './foundation/playground-nav.tsx'

const durations = [
  ['Быстро', motionTokens.duration.fast],
  ['Основное', motionTokens.duration.base],
  ['Медленно', motionTokens.duration.slow],
] as const

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="grid min-w-0 scroll-mt-32 gap-6">
      <div className="grid max-w-2xl gap-2">
        <p className="text-caption tracking-label text-ink-muted uppercase">{eyebrow}</p>
        <h2 className="font-display text-title text-ink">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function NameContract() {
  const toast = useToast()
  const form = useForm<DisplayNameValues>({
    resolver: displayNameResolver,
    defaultValues: { displayName: '' },
  })
  const error = form.formState.errors.displayName?.message

  return (
    <form
      className="border-line bg-canvas-raised grid gap-4 rounded-lg border p-5"
      noValidate
      onSubmit={form.handleSubmit(() => {
        toast.push('Имя принято в этой сессии')
      })}
    >
      <TextField
        id="display-name"
        label="Отображаемое имя"
        hint="Схема Zod. Минимум два символа."
        error={error}
        autoComplete="off"
        {...form.register('displayName')}
      />
      <div>
        <Button type="submit">Проверить</Button>
      </div>
    </form>
  )
}

function MotionDemo() {
  const [cycle, setCycle] = useState(0)
  const reduceMotion = useReducedMotion()

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
      <div key={cycle} className="grid gap-3">
        {durations.map(([label, duration], index) => (
          <motion.div
            key={label}
            initial={reduceMotion ? false : { opacity: 0, y: motionTokens.rise }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : duration,
              delay: reduceMotion ? 0 : index * 0.06,
              ease: [...motionTokens.ease.enter],
            }}
            className="border-line bg-canvas-raised flex min-h-14 items-center justify-between gap-3 rounded-md border px-4"
          >
            <span className="text-body text-ink">{label}</span>
            <span className="text-caption text-ink-muted tabular-nums">
              {Math.round(duration * 1000)} мс
            </span>
          </motion.div>
        ))}
      </div>
      <Button variant="secondary" onClick={() => setCycle((value) => value + 1)}>
        Повторить появление
      </Button>
    </div>
  )
}

function MobileSpecimen() {
  const [pane, setPane] = useState<'frames' | 'path' | 'note'>('frames')
  const panes = [
    ['frames', 'Кадры'],
    ['path', 'Ход'],
    ['note', 'Заметка'],
  ] as const

  return (
    <div className="border-line bg-canvas-sunken mx-auto w-full max-w-sm overflow-hidden rounded-lg border">
      <div className="border-line bg-canvas-raised border-b px-4 py-3">
        <p className="font-display text-title text-ink">Карман</p>
      </div>
      <div className="min-h-40 p-4">
        {pane === 'frames' ? (
          <p className="text-body text-ink-muted">
            Лента кадров на телефоне уходит вбок и не растягивает страницу.
          </p>
        ) : null}
        {pane === 'path' ? <Progress value={42} label="Ход в кармане" /> : null}
        {pane === 'note' ? (
          <p className="text-body text-ink">Короткая заметка остаётся в одном столбце.</p>
        ) : null}
      </div>
      <nav
        aria-label="Нижняя навигация стенда"
        className="border-line bg-canvas-raised grid grid-cols-3 border-t"
      >
        {panes.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={pane === id}
            className={
              pane === id
                ? 'text-accent text-caption min-h-11 font-medium'
                : 'text-ink-muted text-caption min-h-11'
            }
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export function FoundationPage() {
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [retain, setRetain] = useState(true)
  const [lens, setLens] = useState('50')
  const [density, setDensity] = useState('regular')
  const [format, setFormat] = useState('still')
  const [empty, setEmpty] = useState(true)
  const [failed, setFailed] = useState(true)

  return (
    <div className="grid min-w-0 gap-12 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
      <PlaygroundNav />
      <div className="grid min-w-0 gap-16">
        <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.4fr)_18rem]">
          <div className="grid gap-4">
            <p className="text-caption tracking-label text-ink-muted uppercase">Design system</p>
            <h1 className="font-display text-display text-ink">Helios</h1>
            <p className="text-body text-ink-muted max-w-xl">
              Графитовая сцена и один вольфрамовый акцент. Это стенд компонентов, не страница
              сервиса.
            </p>
            <span className="bg-accent h-px w-10" aria-hidden="true" />
          </div>
          <div className="border-line bg-canvas-raised rounded-lg border p-4">
            <SegmentedControl
              name="helios-theme"
              label="Тема"
              value={theme}
              options={[
                { value: 'light', label: 'Светлая' },
                { value: 'dark', label: 'Тёмная' },
              ]}
              onChange={(value) => setTheme(value === 'dark' ? 'dark' : 'light')}
            />
          </div>
        </header>

        <section id="type" className="grid scroll-mt-32 gap-8 lg:grid-cols-12">
          <div className="grid content-end gap-4 lg:col-span-7">
            <p className="text-caption tracking-label text-ink-muted uppercase">Типографика</p>
            <h2 className="font-display text-display text-ink text-balance">Свет держит кадр</h2>
            <p className="text-body text-ink-muted max-w-lg">
              Syne ведёт заголовок. Outfit держит интерфейс. Пара геометрическая, без серифа и без
              декоративного начертания.
            </p>
          </div>
          <ul className="border-line bg-canvas-raised divide-line divide-y rounded-lg border px-5 lg:col-span-5">
            <li className="flex items-baseline justify-between gap-4 py-4">
              <span className="font-display text-display text-ink">Ag</span>
              <span className="text-caption text-ink-muted">Display</span>
            </li>
            <li className="flex items-baseline justify-between gap-4 py-4">
              <span className="font-display text-title text-ink">Заголовок</span>
              <span className="text-caption text-ink-muted">Title</span>
            </li>
            <li className="flex items-baseline justify-between gap-4 py-4">
              <span className="text-body text-ink">Текст интерфейса читается спокойно.</span>
              <span className="text-caption text-ink-muted shrink-0">Body</span>
            </li>
            <li className="flex items-baseline justify-between gap-4 py-4">
              <span className="text-caption text-ink-muted">Подпись и метаданные</span>
              <span className="text-caption text-ink-muted">Caption</span>
            </li>
          </ul>
        </section>

        <section id="color" className="grid scroll-mt-32 gap-4">
          <div className="grid max-w-2xl gap-2">
            <p className="text-caption tracking-label text-ink-muted uppercase">Цвет</p>
            <h2 className="font-display text-title text-ink">Четыре уровня сцены и один акцент</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="bg-accent-fill text-accent-ink col-span-2 flex min-h-52 flex-col justify-between rounded-lg p-5 lg:row-span-2 lg:min-h-full">
              <span className="text-caption tracking-label uppercase">Акцент</span>
              <span className="font-display text-title">Вольфрам</span>
            </div>
            <div className="border-line bg-canvas text-ink flex min-h-28 flex-col justify-end rounded-lg border p-4">
              <span className="text-caption font-medium">Сцена</span>
            </div>
            <div className="bg-canvas-raised text-ink flex min-h-28 flex-col justify-end rounded-lg p-4">
              <span className="text-caption font-medium">Лист</span>
            </div>
            <div className="border-line bg-canvas-overlay text-ink flex min-h-28 flex-col justify-end rounded-lg border p-4">
              <span className="text-caption font-medium">Пластина</span>
            </div>
            <div className="bg-canvas-sunken text-ink flex min-h-28 flex-col justify-end rounded-lg p-4">
              <span className="text-caption font-medium">Колодец</span>
            </div>
            <div className="bg-ink text-canvas flex min-h-28 flex-col justify-end rounded-lg p-4">
              <span className="text-caption font-medium">Чернила</span>
            </div>
            <div className="bg-danger-fill text-danger-ink flex min-h-28 flex-col justify-end rounded-lg p-4">
              <span className="text-caption font-medium">Сбой</span>
            </div>
            <div className="bg-success-fill text-success-ink flex min-h-28 flex-col justify-end rounded-lg p-4">
              <span className="text-caption font-medium">Готово</span>
            </div>
          </div>
        </section>

        <Section id="buttons" eyebrow="Кнопки" title="Одно главное действие на группу">
          <div className="bg-canvas-sunken grid gap-6 rounded-lg p-4 sm:p-5">
            <div className="flex flex-wrap gap-3">
              <Button>Собрать</Button>
              <Button variant="secondary">Отложить</Button>
              <Button variant="tertiary">Подробнее</Button>
              <Button variant="ghost">Скрыть</Button>
              <Button variant="danger">Удалить</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button loading>Сохранение</Button>
              <Button disabled>Недоступна</Button>
              <Tooltip content="Подсказка появляется от наведения и от фокуса.">
                <Button size="icon" variant="secondary" aria-label="Сведения о кнопке">
                  <Info aria-hidden="true" size={18} />
                </Button>
              </Tooltip>
            </div>
          </div>
        </Section>

        <Section id="forms" eyebrow="Формы" title="Поле, поиск, текст и ошибка">
          <div className="grid gap-4 lg:grid-cols-2">
            <NameContract />
            <div className="grid gap-4">
              <TextField
                id="search-session"
                label="Поиск"
                type="search"
                placeholder="Название сессии"
                icon={<Search aria-hidden="true" size={16} />}
              />
              <TextField id="filled-name" label="Заполненное" defaultValue="Северная сцена" />
              <TextField
                id="broken-field"
                label="С ошибкой"
                defaultValue=""
                error="Нужен адрес кадра"
              />
              <TextField
                id="locked-field"
                label="Отключённое"
                defaultValue="Только просмотр"
                disabled
              />
              <TextArea
                id="note"
                label="Заметка"
                rows={4}
                placeholder="Что важно удержать в кадре"
              />
            </div>
          </div>
        </Section>

        <Section id="cards" eyebrow="Карточки" title="Разная масса, не один шаблон">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StandardCard eyebrow="Стандарт" title="Тихая карточка">
              Граница, лист и одна тень. Текст не спорит с заголовком.
            </StandardCard>
            <InteractiveCard
              title="Нажимается целиком"
              action="Открыть сигнал"
              onClick={() => toast.push('Карточка ответила')}
            >
              Вся поверхность — одна кнопка. Внутри нет второй.
            </InteractiveCard>
            <FeatureCard index="04" title="Короткий тезис">
              Индекс акцентом, остальное чернилами.
            </FeatureCard>
            <MediaCard
              title="Рельс в студии"
              meta="Пропорция 4:3 зафиксирована"
              src={railStudio}
              alt="Одежда на деревянных плечиках у светлой стены"
            />
            <GlassCard
              title="Пластина на кадре"
              meta="Текст сидит на плотной подложке"
              src={portraitNorth}
              alt="Портрет в синем свете, тёмный свитер, взгляд в камеру"
            />
          </div>
        </Section>

        <Section id="frames" eyebrow="Кадры" title="Проверка системы на фотографии">
          <FramesSection />
        </Section>

        <Section id="choices" eyebrow="Выбор" title="Переключатели, список и вкладки">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <Switch
                id="notifications"
                label="Показывать служебные сигналы"
                checked={notifications}
                onChange={(event) => setNotifications(event.currentTarget.checked)}
              />
              <Checkbox
                label="Сохранять выбор на этом экране"
                checked={retain}
                onChange={(event) => setRetain(event.currentTarget.checked)}
              />
              <RadioGroup
                name="lens"
                label="Фокусное"
                value={lens}
                onChange={setLens}
                options={[
                  { value: '35', label: '35 мм' },
                  { value: '50', label: '50 мм' },
                  { value: '85', label: '85 мм' },
                ]}
              />
            </div>
            <div className="grid content-start gap-6">
              <SegmentedControl
                name="density"
                label="Плотность"
                value={density}
                onChange={setDensity}
                options={[
                  { value: 'compact', label: 'Плотнее' },
                  { value: 'regular', label: 'Обычная' },
                ]}
              />
              <Dropdown
                label="Формат"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'still', label: 'Кадр' },
                  { value: 'sequence', label: 'Серия' },
                  { value: 'board', label: 'Раскадровка' },
                ]}
              />
              <Tabs
                label="Режимы просмотра"
                tabs={[
                  {
                    id: 'grade',
                    label: 'Градация',
                    panel: 'Тёмная сцена для длинной работы с кадром.',
                  },
                  {
                    id: 'table',
                    label: 'Стол',
                    panel: 'Светлая сцена для просмотра отпечатка.',
                  },
                  {
                    id: 'note',
                    label: 'Заметка',
                    panel: 'Короткий текст без второй колонки.',
                  },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section id="dialogs" eyebrow="Диалоги" title="Окно держит фокус">
          <Button onClick={() => setModalOpen(true)}>Открыть окно</Button>
          <Modal open={modalOpen} title="Служебное окно" onClose={() => setModalOpen(false)}>
            <div className="grid gap-4">
              <p>
                На телефоне окно садится к нижнему краю. Escape, фон и крест возвращают фокус
                странице.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    toast.push('Окно закрыто')
                    setModalOpen(false)
                  }}
                >
                  Понятно
                </Button>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          </Modal>
        </Section>

        <Section id="signals" eyebrow="Сигналы" title="Метки, ход и уведомления">
          <div className="flex flex-wrap gap-2">
            <Badge>Сессия</Badge>
            <Badge tone="accent">Акцент</Badge>
            <Badge tone="success">Готово</Badge>
            <Badge tone="danger">Сбой</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <Progress value={64} label="Резерв превью" />
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => toast.push('Изменение осталось в сессии')}>
                Показать сигнал
              </Button>
              <Button variant="danger" onClick={() => toast.push('Действие отклонено', 'danger')}>
                Показать сбой
              </Button>
            </div>
          </div>
        </Section>

        <Section id="motion" eyebrow="Движение" title="140, 220 и 360 миллисекунд">
          <MotionDemo />
        </Section>

        <Section id="mobile" eyebrow="Мобильные" title="Карманный каркас внутри стенда">
          <MobileSpecimen />
        </Section>

        <Section id="states" eyebrow="Состояния" title="Пусто, загрузка и сбой">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <div className="border-line bg-canvas-raised overflow-hidden rounded-lg border">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="grid gap-2 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <Spinner label="Загрузка фрагмента" />
            </div>
            <div className="grid content-start gap-4">
              {empty ? (
                <EmptyState
                  title="Кадров пока нет"
                  action={
                    <Button variant="secondary" onClick={() => setEmpty(false)}>
                      Показать заготовку
                    </Button>
                  }
                >
                  Пустое состояние занимает свою высоту и не подменяет собой ошибку.
                </EmptyState>
              ) : (
                <Alert tone="success" title="Заготовка на месте">
                  Это локальная смена состояния стенда.
                </Alert>
              )}
              {failed ? (
                <Alert tone="danger" title="Не удалось открыть ресурс">
                  <span className="grid gap-3">
                    <span>Сообщение остаётся в потоке и не сдвигает соседние блоки.</span>
                    <span>
                      <Button variant="secondary" onClick={() => setFailed(false)}>
                        Повторить
                      </Button>
                    </span>
                  </span>
                </Alert>
              ) : (
                <Alert tone="info" title="Ресурс открыт локально">
                  Повтор ничего не запрашивает у сервера.
                </Alert>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
