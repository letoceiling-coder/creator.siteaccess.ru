import { Check, Copy, Shield } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { TextField } from '@/components/ui/text-field.tsx'
import { ApiError, apiFetch, jsonInit } from '@/features/auth/http.ts'
import { useSession } from '@/features/auth/session.ts'
import { cn } from '@/shared/cn.ts'

/* ── запросы ── */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(body.error ?? 'Ошибка запроса', res.status)
  return body
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const reload = useCallback(() => {
    api<T>(path)
      .then((d) => {
        setData(d)
        setError(undefined)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Ошибка'))
  }, [path])
  useEffect(reload, [reload])
  return { data, setData, error, reload }
}

const dt = (ts?: number) =>
  ts
    ? new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="font-display text-title text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error)
    return (
      <Alert tone="danger" title="Ошибка">
        {error}
      </Alert>
    )
  if (ok)
    return (
      <Alert tone="success" title="Готово">
        {ok}
      </Alert>
    )
  return null
}

/* ── сводка ── */

interface Stats {
  users: number
  usersToday: number
  jobsToday: number
  queued: number
  running: number
  failedToday: number
  spentToday: number
}

function Overview() {
  const { data, error } = useLoad<Stats>('/api/admin/stats')
  if (error) return <Notice error={error} />
  if (!data) return <IrisLoader size={32} label="Загрузка" />
  const items: [string, number][] = [
    ['Пользователей', data.users],
    ['Новых за сутки', data.usersToday],
    ['Задач за сутки', data.jobsToday],
    ['В очереди', data.queued],
    ['В работе', data.running],
    ['Ошибок за сутки', data.failedToday],
    ['Потрачено токенов за сутки', data.spentToday],
  ]
  return (
    <Section title="Сводка">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="chamfer-sm bg-canvas-raised grid gap-1 p-4">
            <span className="text-caption text-ink-muted">{label}</span>
            <span className="font-display text-ink text-3xl tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── пользователи ── */

interface AdminUser {
  id: string
  name: string
  email?: string
  role: 'user' | 'admin'
  balance: number
  blocked: boolean
  jobs: number
  providers: string[]
  createdAt: number
  lastLogin?: number
}

function UserRow({ user, onChange }: { user: AdminUser; onChange: (u: AdminUser) => void }) {
  const { me } = useSession()
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const self = me?.user.id === user.id

  async function patch(body: object) {
    setError(undefined)
    try {
      onChange(
        (await api<{ user: AdminUser }>(`/api/admin/users/${user.id}`, jsonInit('PATCH', body)))
          .user,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  async function tokens() {
    setError(undefined)
    try {
      const res = await api<{ user: AdminUser }>(
        `/api/admin/users/${user.id}/tokens`,
        jsonInit('POST', { delta: Number(delta), note }),
      )
      onChange(res.user)
      setDelta('')
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <li className="chamfer-sm bg-canvas-raised grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid">
          <span className="text-ink font-medium">
            {user.name}
            {user.role === 'admin' ? (
              <span className="text-accent ml-2 inline-flex items-center gap-1 text-xs uppercase">
                <Shield size={12} aria-hidden="true" /> админ
              </span>
            ) : null}
            {user.blocked ? (
              <span className="text-danger ml-2 text-xs uppercase">заблокирован</span>
            ) : null}
          </span>
          <span className="text-caption text-ink-muted">
            {user.email ?? '—'} · {user.providers.join(', ') || 'почта'} · задач {user.jobs} · вход{' '}
            {dt(user.lastLogin)}
          </span>
        </div>
        <span className="font-display text-ink text-2xl tabular-nums">{user.balance} ток.</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          aria-label={`Токены для ${user.name}`}
          inputMode="numeric"
          placeholder="+100 или -50"
          value={delta}
          onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))}
          className="bg-canvas-sunken text-ink border-line-strong min-h-11 w-32 border-b-2 px-3"
        />
        <input
          aria-label="Комментарий"
          placeholder="Комментарий"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          className="bg-canvas-sunken text-ink border-line-strong min-h-11 min-w-0 flex-1 border-b-2 px-3"
        />
        <StudioButton variant="outline" disabled={!Number(delta)} onClick={() => void tokens()}>
          Изменить баланс
        </StudioButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <StudioButton
          variant="quiet"
          disabled={self}
          onClick={() => void patch({ role: user.role === 'admin' ? 'user' : 'admin' })}
        >
          {user.role === 'admin' ? 'Снять права админа' : 'Сделать админом'}
        </StudioButton>
        <StudioButton
          variant="quiet"
          disabled={self}
          onClick={() => void patch({ blocked: !user.blocked })}
        >
          {user.blocked ? 'Разблокировать' : 'Заблокировать'}
        </StudioButton>
      </div>
      <Notice error={error} />
    </li>
  )
}

function Users() {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const { data, setData, error } = useLoad<{ users: AdminUser[] }>(
    `/api/admin/users?q=${encodeURIComponent(search)}`,
  )
  return (
    <Section title="Пользователи">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(query.trim())
        }}
      >
        <input
          aria-label="Поиск пользователя"
          placeholder="Почта, имя или id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-canvas-sunken text-ink border-line-strong min-h-11 min-w-0 flex-1 border-b-2 px-3"
        />
        <StudioButton type="submit" variant="outline">
          Найти
        </StudioButton>
      </form>
      <Notice error={error} />
      {data ? (
        <ul className="grid gap-2">
          {data.users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onChange={(next) =>
                setData({ users: data.users.map((x) => (x.id === next.id ? next : x)) })
              }
            />
          ))}
          {data.users.length === 0 ? <p className="text-ink-muted">Никого не нашли.</p> : null}
        </ul>
      ) : (
        <IrisLoader size={32} label="Загрузка" />
      )}
    </Section>
  )
}

/* ── тарифы ── */

interface TariffRow {
  id: string
  title: string
  tokens: number
  price: number
  badge: string
  active: number | boolean
  sort: number
}

function TariffEditor({
  tariff,
  isNew,
  onSaved,
}: {
  tariff: TariffRow
  isNew?: boolean
  onSaved: (rows: TariffRow[]) => void
}) {
  const [row, setRow] = useState(tariff)
  const [error, setError] = useState<string>()
  const set = (patch: Partial<TariffRow>) => setRow((r) => ({ ...r, ...patch }))

  async function save() {
    setError(undefined)
    try {
      const body = { ...row, active: Boolean(row.active) }
      const res = isNew
        ? await api<{ tariffs: TariffRow[] }>('/api/admin/tariffs', jsonInit('POST', body))
        : await api<{ tariffs: TariffRow[] }>(`/api/admin/tariffs/${row.id}`, jsonInit('PUT', body))
      onSaved(res.tariffs)
      if (isNew) setRow(tariff)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить тариф «${row.title}»?`)) return
    onSaved(
      (await api<{ tariffs: TariffRow[] }>(`/api/admin/tariffs/${row.id}`, { method: 'DELETE' }))
        .tariffs,
    )
  }

  const num = (v: string) => Number(v.replace(/\D/g, '') || 0)
  return (
    <li className="chamfer-sm bg-canvas-raised grid gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {isNew ? (
          <TextField
            id={`t-id`}
            label="Код (латиница)"
            value={row.id}
            onChange={(e) => set({ id: e.target.value })}
          />
        ) : null}
        <TextField
          id={`t-title-${row.id}`}
          label="Название"
          value={row.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <TextField
          id={`t-tokens-${row.id}`}
          label="Токенов"
          inputMode="numeric"
          value={String(row.tokens)}
          onChange={(e) => set({ tokens: num(e.target.value) })}
        />
        <TextField
          id={`t-price-${row.id}`}
          label="Цена, ₽"
          inputMode="numeric"
          value={String(row.price)}
          onChange={(e) => set({ price: num(e.target.value) })}
        />
        <TextField
          id={`t-badge-${row.id}`}
          label="Метка"
          value={row.badge}
          onChange={(e) => set({ badge: e.target.value })}
        />
        <TextField
          id={`t-sort-${row.id}`}
          label="Порядок"
          inputMode="numeric"
          value={String(row.sort)}
          onChange={(e) => set({ sort: num(e.target.value) })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          label="Показывать пользователям"
          checked={Boolean(row.active)}
          onChange={(e) => set({ active: e.target.checked })}
        />
        <StudioButton variant="outline" onClick={() => void save()}>
          {isNew ? 'Добавить тариф' : 'Сохранить'}
        </StudioButton>
        {!isNew ? (
          <StudioButton variant="quiet" onClick={() => void remove()}>
            Удалить
          </StudioButton>
        ) : null}
        {row.tokens > 0 && row.price > 0 ? (
          <span className="text-caption text-ink-muted">
            {(row.price / row.tokens).toFixed(2)} ₽ за токен
          </span>
        ) : null}
      </div>
      <Notice error={error} />
    </li>
  )
}

function Tariffs() {
  const { data, setData, error } = useLoad<{ tariffs: TariffRow[] }>('/api/admin/tariffs')
  const blank: TariffRow = {
    id: '',
    title: '',
    tokens: 100,
    price: 199,
    badge: '',
    active: 1,
    sort: 10,
  }
  return (
    <Section title="Тарифы">
      <p className="text-body text-ink-muted">
        Пакеты токенов, которые видят пользователи в кабинете. Оплата — через ЮKassa или Т-Банк
        (раздел «Оплата»); вручную баланс меняется в разделе «Пользователи».
      </p>
      <Notice error={error} />
      {data ? (
        <ul className="grid gap-3">
          {data.tariffs.map((t) => (
            <TariffEditor key={t.id} tariff={t} onSaved={(rows) => setData({ tariffs: rows })} />
          ))}
          <TariffEditor tariff={blank} isNew onSaved={(rows) => setData({ tariffs: rows })} />
        </ul>
      ) : (
        <IrisLoader size={32} label="Загрузка" />
      )}
    </Section>
  )
}

/* ── цены и бонусы ── */

interface Settings {
  prices: { photo: number; video: number; animate5: number; animate10: number }
  bonuses: { signup: number; daily: number; referrer: number; invitee: number; subscribe: number }
}

function Pricing() {
  const { data, setData, error } = useLoad<Settings>('/api/admin/settings')
  const [status, setStatus] = useState<{ error?: string; ok?: string }>({})
  if (error) return <Notice error={error} />
  if (!data) return <IrisLoader size={32} label="Загрузка" />

  const num = (v: string) => Number(v.replace(/\D/g, '') || 0)
  const field = (group: 'prices' | 'bonuses', key: string, label: string, hint?: string) => (
    <TextField
      key={key}
      id={`${group}-${key}`}
      label={label}
      hint={hint}
      inputMode="numeric"
      value={String((data[group] as Record<string, number>)[key])}
      onChange={(e) =>
        setData({ ...data, [group]: { ...data[group], [key]: num(e.target.value) } } as Settings)
      }
    />
  )

  async function save() {
    try {
      setData(await api<Settings>('/api/admin/settings', jsonInit('PUT', data)))
      setStatus({ ok: 'Цены и бонусы сохранены' })
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : 'Ошибка' })
    }
  }

  return (
    <Section title="Цены и бонусы">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-3">
          <h3 className="text-ink font-medium">Стоимость в токенах</h3>
          {field('prices', 'photo', 'Фотосессия (5 кадров)')}
          {field('prices', 'video', 'Видеосюжет (≈19 с)')}
          {field('prices', 'animate5', 'Оживление фото, 5 с')}
          {field('prices', 'animate10', 'Оживление фото, 10 с')}
        </div>
        <div className="grid gap-3">
          <h3 className="text-ink font-medium">Бонусы</h3>
          {field('bonuses', 'signup', 'За регистрацию')}
          {field(
            'bonuses',
            'daily',
            'Бесплатно в сутки',
            'Начисляются раз в сутки, только при нулевом балансе',
          )}
          {field('bonuses', 'invitee', 'Приглашённому другу', 'Сразу при регистрации по ссылке')}
          {field(
            'bonuses',
            'referrer',
            'Пригласившему',
            'Когда друг создаст первую работу — защита от накрутки',
          )}
          {field(
            'bonuses',
            'subscribe',
            'За подписку на канал',
            'Один раз за каждый канал; подписка проверяется через бота',
          )}
        </div>
      </div>
      <StudioButton onClick={() => void save()}>Сохранить</StudioButton>
      <Notice {...status} />
    </Section>
  )
}

/* ── интеграции ── */

type Secret = { set: boolean; hint: string }
interface Integrations {
  yandex: { enabled: boolean; clientId: string; clientSecret: Secret }
  vk: { enabled: boolean; clientId: string; clientSecret: Secret }
  telegram: { enabled: boolean; botUsername: string; botToken: Secret }
  max: { enabled: boolean; botToken: Secret }
  openrouter: { enabled: boolean; apiKey: Secret; models: string }
}

function CopyLine({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="flex items-center gap-2">
      <code className="bg-canvas-sunken text-ink min-w-0 flex-1 truncate px-2 py-1 text-xs">
        {value}
      </code>
      <button
        type="button"
        aria-label="Скопировать"
        className="text-ink-muted hover:text-ink grid size-11 place-items-center"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1500)
          })
        }}
      >
        {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </span>
  )
}

function Help({ steps, links }: { steps: ReactNode[]; links?: [string, string][] }) {
  return (
    <details className="bg-canvas-sunken p-4">
      <summary className="text-ink cursor-pointer font-medium">Как настроить</summary>
      <ol className="text-body text-ink-muted mt-3 grid list-decimal gap-2 pl-5">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {links?.length ? (
        <p className="text-caption mt-3 flex flex-wrap gap-3">
          {links.map(([title, href]) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline"
            >
              {title}
            </a>
          ))}
        </p>
      ) : null}
    </details>
  )
}

/* ── состояние ботов ── */

interface BotsStatus {
  telegram: {
    error?: string
    username?: string
    mode?: 'polling' | 'webhook'
    webhookOk?: boolean
    lastError?: string
    menuButton?: string
    miniAppOk?: boolean
  }
  max: {
    error?: string
    username?: string
    name?: string
    webhookOk?: boolean
    otherSubscriptions?: string[]
  }
}

function Flag({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          'grid size-5 place-items-center text-xs',
          ok ? 'bg-success text-white' : 'bg-danger text-white',
        )}
        aria-hidden="true"
      >
        {ok ? '✓' : '!'}
      </span>
      <span className="text-ink">{label}</span>
    </li>
  )
}

function BotPanel({ platform }: { platform: 'telegram' | 'max' }) {
  const [status, setStatus] = useState<BotsStatus>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({})

  const load = useCallback(() => {
    api<BotsStatus>('/api/admin/bots/status')
      .then(setStatus)
      .catch((e: unknown) => setMessage({ error: e instanceof Error ? e.message : 'Ошибка' }))
  }, [])
  useEffect(load, [load])

  async function setup() {
    const current = status?.[platform]
    if (
      platform === 'max' &&
      status?.max.otherSubscriptions?.length &&
      !window.confirm(
        `У этого бота уже есть вебхуки других сайтов: ${status.max.otherSubscriptions.join(', ')}. ` +
          'После подключения сообщения боту будут приходить и им, и студии — оба сервиса будут отвечать. ' +
          'Лучше создать для студии отдельного бота. Всё равно подключить?',
      )
    )
      return
    void current
    setBusy(true)
    setMessage({})
    try {
      await api(`/api/admin/bots/${platform}/setup`, { method: 'POST' })
      setMessage({ ok: 'Бот настроен' })
      load()
    } catch (e) {
      setMessage({ error: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const s = status?.[platform]
  return (
    <div className="bg-canvas-sunken grid gap-3 p-4">
      <span className="text-ink font-medium">Состояние бота</span>
      {!s ? (
        <IrisLoader size={24} label="Проверяем бота" />
      ) : s.error ? (
        <p className="text-caption text-danger">{s.error}</p>
      ) : platform === 'telegram' ? (
        <ul className="text-body grid gap-1">
          <Flag ok label={`Бот @${status!.telegram.username}`} />
          <Flag
            ok={status!.telegram.webhookOk}
            label={
              status!.telegram.mode === 'polling'
                ? 'Приём сообщений через прокси (ответы на /start, вход через бота)'
                : 'Вебхук на студию (ответы на /start, вход через бота)'
            }
          />
          <Flag ok={status!.telegram.miniAppOk} label="Кнопка мини-приложения в чате с ботом" />
          {status!.telegram.lastError ? (
            <li className="text-caption text-danger">
              Последняя ошибка: {status!.telegram.lastError}
            </li>
          ) : null}
        </ul>
      ) : (
        <ul className="text-body grid gap-1">
          <Flag ok label={`Бот @${status!.max.username} («${status!.max.name}»)`} />
          <Flag ok={status!.max.webhookOk} label="Вебхук на студию (ответы, вход через бота)" />
          {status!.max.otherSubscriptions?.length ? (
            <li className="text-caption text-danger">
              У бота есть вебхуки других сайтов: {status!.max.otherSubscriptions.join(', ')}. Для
              студии лучше отдельный бот.
            </li>
          ) : null}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <StudioButton
          variant="outline"
          disabled={busy || !s || Boolean(s.error)}
          onClick={() => void setup()}
        >
          {busy ? 'Настраиваем…' : 'Настроить бота'}
        </StudioButton>
        <StudioButton variant="quiet" onClick={load}>
          Проверить
        </StudioButton>
      </div>
      <Notice {...message} />
    </div>
  )
}

function IntegrationsPanel() {
  const { data, error } = useLoad<{ integrations: Integrations }>('/api/admin/integrations')
  const [draft, setDraft] = useState<Record<string, Record<string, string | boolean>>>({})
  const [saved, setSaved] = useState<Integrations>()
  const [status, setStatus] = useState<{ error?: string; ok?: string }>({})
  const origin = window.location.origin
  const current = saved ?? data?.integrations

  if (error) return <Notice error={error} />
  if (!current) return <IrisLoader size={32} label="Загрузка" />

  const value = (p: string, k: string, fallback: string | boolean) => draft[p]?.[k] ?? fallback
  const set = (p: string, k: string, v: string | boolean) =>
    setDraft((d) => ({ ...d, [p]: { ...d[p], [k]: v } }))

  async function save() {
    try {
      const res = await api<{ integrations: Integrations }>(
        '/api/admin/integrations',
        jsonInit('PUT', draft),
      )
      setSaved(res.integrations)
      setDraft({})
      setStatus({ ok: 'Интеграции сохранены. Секреты хранятся на сервере и сюда не возвращаются.' })
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : 'Ошибка' })
    }
  }

  const secretField = (p: string, k: string, label: string, secret: Secret) => (
    <TextField
      id={`${p}-${k}`}
      label={label}
      type="password"
      autoComplete="off"
      placeholder={
        secret.set ? `Сохранён ${secret.hint} — оставьте пустым, чтобы не менять` : 'Не задан'
      }
      value={String(value(p, k, ''))}
      onChange={(e) => set(p, k, e.target.value)}
    />
  )

  const card = (p: keyof Integrations, title: string, body: ReactNode, help: ReactNode) => (
    <div className="chamfer-sm bg-canvas-raised grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-ink text-xl">{title}</h3>
        <Checkbox
          label="Включено"
          checked={Boolean(value(p, 'enabled', current[p].enabled))}
          onChange={(e) => set(p, 'enabled', e.target.checked)}
        />
      </div>
      {body}
      {help}
    </div>
  )

  return (
    <Section title="Интеграции для быстрого входа">
      <p className="text-body text-ink-muted">
        Включённые способы появляются на странице входа. Ключи хранятся только на сервере.
      </p>
      {card(
        'yandex',
        'Яндекс ID',
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="yandex-clientId"
            label="ClientID"
            value={String(value('yandex', 'clientId', current.yandex.clientId))}
            onChange={(e) => set('yandex', 'clientId', e.target.value)}
          />
          {secretField('yandex', 'clientSecret', 'Client secret', current.yandex.clientSecret)}
        </div>,
        <Help
          steps={[
            'Откройте oauth.yandex.ru и нажмите «Создать приложение».',
            'Тип — «Веб-сервисы». Название и иконка будут видны пользователю при входе.',
            <>
              Redirect URI: <CopyLine value={`${origin}/api/auth/yandex/callback`} />
            </>,
            <>
              Suggest Hostname: <CopyLine value={origin} />
            </>,
            'Доступы: «Доступ к адресу электронной почты», «Доступ к логину, имени и фамилии», «Доступ к портрету пользователя».',
            'Сохраните приложение, скопируйте ClientID и Client secret сюда, включите и нажмите «Сохранить».',
          ]}
          links={[['Кабинет Яндекс OAuth', 'https://oauth.yandex.ru/']]}
        />,
      )}
      {card(
        'vk',
        'VK ID',
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="vk-clientId"
            label="ID приложения"
            value={String(value('vk', 'clientId', current.vk.clientId))}
            onChange={(e) => set('vk', 'clientId', e.target.value)}
          />
          {secretField(
            'vk',
            'clientSecret',
            'Защищённый ключ (необязательно)',
            current.vk.clientSecret,
          )}
        </div>,
        <Help
          steps={[
            'Откройте кабинет VK ID для бизнеса и создайте приложение, платформа — «Web».',
            <>
              Базовый домен: <CopyLine value={new URL(origin).host} />
            </>,
            <>
              Доверенный Redirect URL: <CopyLine value={`${origin}/api/auth/vk/callback`} />
            </>,
            'В разделе «Доступы» включите почту, если она нужна.',
            'Скопируйте ID приложения сюда. Вход идёт по OAuth 2.1 с PKCE, защищённый ключ хранить не обязательно.',
          ]}
          links={[['Кабинет VK ID', 'https://id.vk.com/about/business/go']]}
        />,
      )}
      {card(
        'telegram',
        'Telegram',
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="telegram-botUsername"
              label="Имя бота (без @)"
              value={String(value('telegram', 'botUsername', current.telegram.botUsername))}
              onChange={(e) => set('telegram', 'botUsername', e.target.value)}
            />
            {secretField('telegram', 'botToken', 'Токен бота', current.telegram.botToken)}
          </div>
          <BotPanel platform="telegram" />
        </div>,
        <Help
          steps={[
            'В Telegram откройте @BotFather, команда /newbot — получите токен бота.',
            'Вставьте имя бота и токен сюда, включите и сохраните.',
            <>
              Нажмите «Настроить бота»: студия сама поставит вебхук и кнопку мини-приложения{' '}
              <CopyLine value={`${origin}/telegram`} />
            </>,
            'На сайте «Войти через Telegram» откроет бота; пользователь нажмёт «Подтвердить вход» — браузер войдёт сам. Внутри мини-приложения вход автоматический.',
            <>
              Для ссылок вида t.me/бот?startapp (необязательно): в @BotFather → Bot Settings →
              Configure Mini App укажите тот же адрес.
            </>,
          ]}
          links={[
            ['@BotFather', 'https://t.me/BotFather'],
            ['Документация Mini Apps', 'https://core.telegram.org/bots/webapps'],
          ]}
        />,
      )}
      {card(
        'max',
        'MAX',
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {secretField('max', 'botToken', 'Токен бота MAX', current.max.botToken)}
          </div>
          <BotPanel platform="max" />
        </div>,
        <Help
          steps={[
            'Зарегистрируйте организацию на платформе для партнёров MAX и создайте отдельного бота для студии — получите токен.',
            <>
              В настройках мини-приложения бота укажите адрес <CopyLine value={`${origin}/max`} />
            </>,
            'Вставьте токен сюда, включите и сохраните, затем нажмите «Настроить бота» — студия подпишется на события бота (вебхук с секретом).',
            'На сайте появится «Войти через MAX»: пользователь откроет бота, нажмёт «Подтвердить вход» — и браузер войдёт сам. Внутри мини-приложения вход происходит автоматически.',
            'Если у бота уже есть вебхуки других сайтов, сообщения будут приходить всем — поэтому для студии нужен свой бот.',
          ]}
          links={[['Платформа MAX для партнёров', 'https://dev.max.ru/']]}
        />,
      )}
      {card(
        'openrouter',
        'OpenRouter — тексты и сценарии агента',
        <div className="grid gap-3 sm:grid-cols-2">
          {secretField('openrouter', 'apiKey', 'API-ключ OpenRouter', current.openrouter.apiKey)}
          <TextField
            id="openrouter-models"
            label="Свои бесплатные модели (необязательно)"
            placeholder="пусто — подбираются сами"
            value={String(value('openrouter', 'models', current.openrouter.models))}
            onChange={(e) => set('openrouter', 'models', e.target.value)}
          />
        </div>,
        <Help
          steps={[
            'Создайте ключ на openrouter.ai (раздел Keys). Пополнять баланс не нужно: агент берёт только бесплатные модели (с окончанием :free и нулевой ценой).',
            'Вставьте ключ сюда, включите и сохраните. Запросы идут через тот же прокси, что и Telegram.',
            'Если OpenRouter недоступен или лимит бесплатных запросов исчерпан, агент сам переключится на модель на сервере (Ollama) — её имя задаётся на вкладке «Автопостинг».',
            'Модели можно задать вручную через запятую, например deepseek/deepseek-chat-v3-0324:free. Платные модели игнорируются.',
          ]}
          links={[['OpenRouter: ключи', 'https://openrouter.ai/settings/keys']]}
        />,
      )}
      <StudioButton onClick={() => void save()}>Сохранить интеграции</StudioButton>
      <Notice {...status} />
    </Section>
  )
}

/* ── оплата ── */

interface PaymentsSettings {
  yookassa: { enabled: boolean; shopId: string; secretKey: Secret }
  tbank: { enabled: boolean; terminalKey: string; password: Secret }
  receipts: { enabled: boolean; taxation: number; vat: number }
}

interface Order {
  id: string
  title: string
  tokens: number
  amount: number
  provider: string
  status: string
  user: string
  createdAt: number
  paidAt?: number
}

const taxations: [number, string][] = [
  [1, 'ОСН'],
  [2, 'УСН доходы'],
  [3, 'УСН доходы минус расходы'],
  [5, 'ЕСХН'],
  [6, 'Патент'],
]
const vats: [number, string][] = [
  [1, 'Без НДС'],
  [2, 'НДС 0%'],
  [3, 'НДС 10%'],
  [4, 'НДС 20%'],
]

function PaymentsPanel() {
  const { data, error } = useLoad<{ payments: PaymentsSettings }>('/api/admin/payments')
  const orders = useLoad<{ orders: Order[] }>('/api/admin/orders')
  const [draft, setDraft] = useState<Record<string, Record<string, string | boolean | number>>>({})
  const [saved, setSaved] = useState<PaymentsSettings>()
  const [status, setStatus] = useState<{ error?: string; ok?: string }>({})
  const origin = window.location.origin
  const current = saved ?? data?.payments

  if (error) return <Notice error={error} />
  if (!current) return <IrisLoader size={32} label="Загрузка" />

  const value = <T,>(p: string, k: string, fallback: T): T => (draft[p]?.[k] as T) ?? fallback
  const set = (p: string, k: string, v: string | boolean | number) =>
    setDraft((d) => ({ ...d, [p]: { ...d[p], [k]: v } }))

  async function save() {
    try {
      const res = await api<{ payments: PaymentsSettings }>(
        '/api/admin/payments',
        jsonInit('PUT', draft),
      )
      setSaved(res.payments)
      setDraft({})
      setStatus({ ok: 'Настройки оплаты сохранены. Ключи хранятся только на сервере.' })
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : 'Ошибка' })
    }
  }

  const secret = (p: string, k: string, label: string, sec: Secret) => (
    <TextField
      id={`${p}-${k}`}
      label={label}
      type="password"
      autoComplete="off"
      placeholder={sec.set ? `Сохранён ${sec.hint} — оставьте пустым, чтобы не менять` : 'Не задан'}
      value={String(value(p, k, ''))}
      onChange={(e) => set(p, k, e.target.value)}
    />
  )

  const select = (k: 'taxation' | 'vat', label: string, options: [number, string][]) => (
    <label className="grid gap-2">
      <span className="text-caption text-ink font-medium">{label}</span>
      <select
        className="bg-canvas-sunken text-ink border-line-strong min-h-11 border-b-2 px-3"
        value={value('receipts', k, current.receipts[k])}
        onChange={(e) => set('receipts', k, Number(e.target.value))}
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Section title="Оплата тарифов">
      <p className="text-body text-ink-muted">
        Пользователь выбирает тариф в кабинете и платит на странице ЮKassa или Т-Банка. Токены
        начисляются один раз и только после подтверждения банком. Цены и пакеты — в разделе
        «Тарифы».
      </p>

      <div className="chamfer-sm bg-canvas-raised grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-ink text-xl">ЮKassa</h3>
          <Checkbox
            label="Включено"
            checked={Boolean(value('yookassa', 'enabled', current.yookassa.enabled))}
            onChange={(e) => set('yookassa', 'enabled', e.target.checked)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="yookassa-shopId"
            label="shopId"
            value={String(value('yookassa', 'shopId', current.yookassa.shopId))}
            onChange={(e) => set('yookassa', 'shopId', e.target.value)}
          />
          {secret('yookassa', 'secretKey', 'Секретный ключ', current.yookassa.secretKey)}
        </div>
        <Help
          steps={[
            'В личном кабинете ЮKassa откройте магазин (для проверки — тестовый магазин).',
            'Интеграция → Ключи API → выпустите секретный ключ. shopId указан там же.',
            <>
              Интеграция → HTTP-уведомления → URL для уведомлений:{' '}
              <CopyLine value={`${origin}/api/payments/yookassa/webhook`} />
            </>,
            'Отметьте события payment.succeeded и payment.canceled.',
            'Вставьте shopId и ключ сюда, включите и сохраните. Тестовый магазин: тестовые карты ЮKassa, деньги не списываются.',
            'Сервер не доверяет телу уведомления: статус платежа перепроверяется запросом в API ЮKassa.',
          ]}
          links={[
            ['Кабинет ЮKassa', 'https://yookassa.ru/my'],
            ['Документация API', 'https://yookassa.ru/developers/api'],
          ]}
        />
      </div>

      <div className="chamfer-sm bg-canvas-raised grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-ink text-xl">Т-Банк (Т-Касса)</h3>
          <Checkbox
            label="Включено"
            checked={Boolean(value('tbank', 'enabled', current.tbank.enabled))}
            onChange={(e) => set('tbank', 'enabled', e.target.checked)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="tbank-terminalKey"
            label="TerminalKey"
            value={String(value('tbank', 'terminalKey', current.tbank.terminalKey))}
            onChange={(e) => set('tbank', 'terminalKey', e.target.value)}
          />
          {secret('tbank', 'password', 'Пароль терминала', current.tbank.password)}
        </div>
        <Help
          steps={[
            'В личном кабинете Т-Бизнеса откройте интернет-эквайринг → Магазины → ваш магазин → Терминалы.',
            'Для проверки возьмите тестовый терминал (TerminalKey оканчивается на DEMO), для приёма денег — рабочий.',
            'Скопируйте TerminalKey и пароль терминала сюда.',
            <>
              Адрес уведомлений передаётся автоматически при создании платежа:{' '}
              <CopyLine value={`${origin}/api/payments/tbank/webhook`} />. Если в настройках
              терминала задан свой — укажите этот же.
            </>,
            'Подпись каждого уведомления проверяется паролем терминала; поддельные уведомления отклоняются.',
          ]}
          links={[
            ['Документация Т-Кассы', 'https://www.tbank.ru/kassa/dev/payments/'],
            ['Кабинет Т-Бизнеса', 'https://business.tbank.ru/'],
          ]}
        />
      </div>

      <div className="chamfer-sm bg-canvas-raised grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-ink text-xl">Чеки (54-ФЗ)</h3>
          <Checkbox
            label="Передавать данные для чека"
            checked={Boolean(value('receipts', 'enabled', current.receipts.enabled))}
            onChange={(e) => set('receipts', 'enabled', e.target.checked)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {select('taxation', 'Система налогообложения', taxations)}
          {select('vat', 'Ставка НДС', vats)}
        </div>
        <p className="text-caption text-ink-muted">
          Включайте, если в ЮKassa или Т-Кассе подключена онлайн-касса или «Чеки от ЮKassa». Чек
          уходит на почту пользователя; если почты в профиле нет, кабинет попросит её перед оплатой.
          Систему налогообложения и ставку уточните у бухгалтера.
        </p>
      </div>

      <StudioButton onClick={() => void save()}>Сохранить настройки оплаты</StudioButton>
      <Notice {...status} />

      <h3 className="font-display text-ink mt-4 text-xl">Платежи</h3>
      {orders.data ? (
        <ul className="divide-line border-line grid divide-y border-y">
          {orders.data.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="grid">
                <span className="text-ink">
                  {o.title} · {o.tokens} ток. · {o.amount.toLocaleString('ru-RU')} ₽
                </span>
                <span className="text-caption text-ink-muted">
                  {o.user} · {o.provider === 'tbank' ? 'Т-Банк' : 'ЮKassa'} · {dt(o.createdAt)}
                </span>
              </span>
              <span
                className={cn(
                  'text-caption uppercase',
                  o.status === 'paid'
                    ? 'text-success'
                    : o.status === 'pending'
                      ? 'text-ink-muted'
                      : 'text-danger',
                )}
              >
                {{ paid: 'оплачен', pending: 'ожидает', canceled: 'отменён', failed: 'ошибка' }[
                  o.status
                ] ?? o.status}
              </span>
            </li>
          ))}
          {orders.data.orders.length === 0 ? (
            <li className="text-ink-muted py-3">Платежей пока нет.</li>
          ) : null}
        </ul>
      ) : (
        <IrisLoader size={32} label="Загрузка" />
      )}
    </Section>
  )
}

/* ── задачи ── */

interface AdminJob {
  id: string
  kind: string
  target: string
  status: string
  cost: number
  refunded: boolean
  error?: string
  user: string
  createdAt: number
}

function Jobs() {
  const { data, error, reload } = useLoad<{ jobs: AdminJob[]; queued: number }>('/api/admin/jobs')
  if (error) return <Notice error={error} />
  if (!data) return <IrisLoader size={32} label="Загрузка" />
  return (
    <Section title={`Задачи · в очереди ${data.queued}`}>
      <StudioButton variant="outline" onClick={reload}>
        Обновить
      </StudioButton>
      <ul className="divide-line border-line grid divide-y border-y">
        {data.jobs.map((j) => (
          <li key={j.id} className="grid gap-1 py-3">
            <span className="flex flex-wrap justify-between gap-2">
              <span className="text-ink">
                {j.kind} · {j.target}
              </span>
              <span
                className={cn(
                  'text-caption uppercase',
                  j.status === 'done'
                    ? 'text-success'
                    : j.status === 'failed'
                      ? 'text-danger'
                      : 'text-ink-muted',
                )}
              >
                {j.status}
                {j.refunded ? ' · возврат' : ''}
              </span>
            </span>
            <span className="text-caption text-ink-muted">
              {j.user} · {dt(j.createdAt)} · {j.cost} ток.{j.error ? ` · ${j.error}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ── публикации в каналы ── */

interface Channel {
  id: string
  platform: 'telegram' | 'max'
  chatId: string
  title: string
  username?: string
  canPost: boolean
}
interface ChannelLimits {
  telegram: { text: number; caption: number; media: number; photo: number; video: number }
  max: { text: number; media: number; photo: number; video: number }
  post: { media: number; body: number }
}
interface PostResult {
  channel: string
  title: string
  platform: string
  ok: boolean
  url?: string
  error?: string
}
interface Post {
  id: string
  text: string
  media: { kind: 'photo' | 'video'; name: string; size: number }[]
  button?: { text: string; url: string }
  results: PostResult[]
  status: 'sending' | 'sent' | 'partial' | 'failed'
  createdAt: number
}

const MB = 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
const platformName = { telegram: 'Telegram', max: 'MAX' } as const

function ChannelsList({
  channels,
  onChange,
}: {
  channels: Channel[]
  onChange: (c: Channel[]) => void
}) {
  const [platform, setPlatform] = useState<'telegram' | 'max'>('telegram')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({})

  async function add() {
    setBusy(true)
    setMessage({})
    try {
      const { channel } = await api<{ channel: Channel }>(
        '/api/admin/channels',
        jsonInit('POST', { platform, ref }),
      )
      onChange([...channels.filter((c) => c.id !== channel.id), channel])
      setRef('')
      setMessage({
        ok: channel.canPost
          ? `Канал «${channel.title}» добавлен`
          : `Канал «${channel.title}» найден, но у бота нет права публиковать`,
      })
    } catch (e) {
      setMessage({ error: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: Channel) {
    if (!window.confirm(`Убрать «${c.title}» из списка? Сам канал не изменится.`)) return
    const res = await api<{ channels: Channel[] }>(`/api/admin/channels/${c.id}`, {
      method: 'DELETE',
    })
    onChange(res.channels)
  }

  return (
    <div className="bg-canvas-sunken grid gap-3 p-4">
      <span className="text-ink font-medium">Каналы</span>
      {channels.length === 0 ? (
        <p className="text-caption text-ink-muted">Каналов пока нет — добавьте ниже.</p>
      ) : (
        <ul className="divide-line grid divide-y">
          {channels.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="grid min-w-0">
                <span className="text-ink truncate">
                  {platformName[c.platform]} · {c.title}
                </span>
                <span className={cn('text-caption', c.canPost ? 'text-ink-muted' : 'text-danger')}>
                  {c.username ? `@${c.username.replace(/^https?:\/\/max\.ru\//, '')} · ` : ''}
                  ID {c.chatId}
                  {c.canPost ? '' : ' · бот не может публиковать'}
                </span>
              </span>
              <StudioButton variant="quiet" onClick={() => void remove(c)}>
                Убрать
              </StudioButton>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="grid gap-1">
          <span className="text-caption text-ink-muted">Платформа</span>
          <select
            className="border-line bg-canvas text-ink min-h-11 border px-3"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as 'telegram' | 'max')}
          >
            <option value="telegram">Telegram</option>
            <option value="max">MAX</option>
          </select>
        </label>
        <TextField
          id="channel-ref"
          label={
            platform === 'telegram'
              ? '@имя или ссылка t.me'
              : 'ID канала MAX или адрес из web.max.ru'
          }
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={platform === 'telegram' ? '@neeklo_ai' : '-72000000000000'}
        />
        <StudioButton variant="outline" disabled={busy || !ref.trim()} onClick={() => void add()}>
          {busy ? 'Проверяем…' : 'Добавить'}
        </StudioButton>
      </div>
      <p className="text-caption text-ink-muted">
        Бот должен быть администратором канала с правом публикации. MAX не даёт боту список его
        каналов (документация, «Получение ID чата или канала»): ID приходит событием, когда бота
        назначают администратором. Если канал не появился — уберите бота из администраторов и
        назначьте снова, затем обновите страницу. Вручную: откройте канал в web.max.ru и вставьте
        сюда адрес или число из него (не имя бота и не @ссылку).
      </p>
      <Notice {...message} />
    </div>
  )
}

interface Draft {
  file: File
  kind: 'photo' | 'video'
  url: string
}

function Composer({
  channels,
  limits,
  onSent,
}: {
  channels: Channel[]
  limits: ChannelLimits
  onSent: () => void
}) {
  const ready = channels.filter((c) => c.canPost)
  const [selected, setSelected] = useState<string[]>(() => ready.map((c) => c.id))
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Draft[]>([])
  const [buttonText, setButtonText] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ error?: string; results?: PostResult[] }>({})

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files])

  const targets = ready.filter((c) => selected.includes(c.id))
  const platforms = [...new Set(targets.map((c) => c.platform))]

  function pick(list: FileList | null) {
    if (!list) return
    const added: Draft[] = []
    const bad: string[] = []
    for (const file of list) {
      const kind = PHOTO_TYPES.includes(file.type)
        ? 'photo'
        : VIDEO_TYPES.includes(file.type)
          ? 'video'
          : undefined
      if (!kind) bad.push(file.name)
      else added.push({ file, kind, url: URL.createObjectURL(file) })
    }
    setFiles((prev) => [...prev, ...added])
    setResult(
      bad.length
        ? {
            error: `Не подходят: ${bad.join(', ')}. Фото JPEG, PNG, WebP; видео MP4, MOV, WebM, MKV.`,
          }
        : {},
    )
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i]!.url)
      return prev.filter((_f, j) => j !== i)
    })
  }

  function move(i: number, d: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev]
      const j = i + d
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  // Те же проверки, что на сервере: ограничения каждой выбранной платформы.
  const problems: string[] = []
  const notes: string[] = []
  if (!text.trim() && files.length === 0) problems.push('Добавьте текст или файлы')
  if (files.length > limits.post.media)
    problems.push(`Не больше ${limits.post.media} фото и видео в посте`)
  const total = files.reduce((s, f) => s + f.file.size, 0)
  if (total > limits.post.body) problems.push('Файлы вместе больше 260 МБ')
  for (const p of platforms) {
    const l = limits[p]
    if (text.length > l.text) problems.push(`${platformName[p]}: текст длиннее ${l.text} символов`)
    for (const f of files) {
      const cap = f.kind === 'video' ? l.video : l.photo
      if (f.file.size > cap)
        problems.push(`${platformName[p]}: «${f.file.name}» больше ${Math.round(cap / MB)} МБ`)
    }
  }
  if (platforms.includes('telegram') && files.length > 0 && text.length > limits.telegram.caption)
    notes.push(
      `Telegram: подпись к медиа — до ${limits.telegram.caption} символов, поэтому текст уйдёт отдельным сообщением после медиа.`,
    )
  if (platforms.includes('telegram') && files.length > 1 && buttonText)
    notes.push('Telegram: к альбому кнопку прикрепить нельзя — она уйдёт отдельным сообщением.')
  if (buttonText && !/^https:\/\/\S+$/.test(buttonUrl))
    problems.push('Ссылка кнопки должна начинаться с https://')
  if (targets.length === 0) problems.push('Выберите канал')

  async function submit() {
    if (
      !window.confirm(
        `Опубликовать в ${targets.map((c) => `«${c.title}»`).join(', ')}? Пост увидят подписчики.`,
      )
    )
      return
    setBusy(true)
    setResult({})
    const body = new FormData()
    body.append('text', text)
    for (const id of selected) body.append('channels', id)
    for (const f of files) body.append('files', f.file, f.file.name)
    if (buttonText) {
      body.append('buttonText', buttonText)
      body.append('buttonUrl', buttonUrl)
    }
    try {
      const res = await api<{ status: string; results: PostResult[] }>('/api/admin/posts', {
        method: 'POST',
        body,
      })
      setResult({ results: res.results })
      if (res.status === 'sent') {
        setText('')
        setFiles([])
        setButtonText('')
        setButtonUrl('')
      }
      onSent()
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  const textLimit = Math.min(...platforms.map((p) => limits[p].text), 4096)

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-1">
        <legend className="text-caption text-ink-muted mb-1">Куда</legend>
        {ready.length === 0 ? (
          <p className="text-caption text-ink-muted">Нет каналов, где бот может публиковать.</p>
        ) : (
          ready.map((c) => (
            <Checkbox
              key={c.id}
              label={`${platformName[c.platform]} · ${c.title}`}
              checked={selected.includes(c.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id),
                )
              }
            />
          ))
        )}
      </fieldset>

      <label className="grid gap-1">
        <span className="flex justify-between gap-2">
          <span className="text-caption text-ink-muted">Текст</span>
          <span
            className={cn(
              'text-caption tabular-nums',
              text.length > textLimit ? 'text-danger' : 'text-ink-muted',
            )}
          >
            {text.length} / {textLimit}
          </span>
        </span>
        <textarea
          className="border-line bg-canvas text-ink min-h-40 border p-3"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст поста"
        />
        <span className="text-caption text-ink-muted">
          Разметка: **жирный**, _курсив_, [текст ссылки](https://адрес).
        </span>
      </label>

      <div className="grid gap-2">
        <span className="text-caption text-ink-muted">
          Фото и видео · {files.length} / {limits.post.media} · несколько файлов уйдут галереей
        </span>
        {files.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {files.map((f, i) => (
              <li key={f.url} className="bg-canvas-sunken grid gap-1 p-1">
                {f.kind === 'video' ? (
                  <video src={f.url} muted className="aspect-square w-full object-cover" />
                ) : (
                  <img src={f.url} alt="" className="aspect-square w-full object-cover" />
                )}
                <span className="text-caption text-ink-muted truncate px-1">
                  {f.kind === 'video' ? 'Видео' : 'Фото'} · {(f.file.size / MB).toFixed(1)} МБ
                </span>
                <span className="flex">
                  <button
                    type="button"
                    className="text-ink min-h-11 flex-1"
                    aria-label="Раньше"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="text-danger min-h-11 flex-1"
                    aria-label={`Убрать ${f.file.name}`}
                    onClick={() => removeFile(i)}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className="text-ink min-h-11 flex-1"
                    aria-label="Позже"
                    disabled={i === files.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    →
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="border-line text-ink grid min-h-11 cursor-pointer place-items-center border border-dashed px-3 py-2">
          Добавить фото или видео
          <input
            type="file"
            multiple
            accept={[...PHOTO_TYPES, ...VIDEO_TYPES].join(',')}
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <TextField
          id="post-button-text"
          label="Кнопка под постом (необязательно)"
          value={buttonText}
          maxLength={64}
          onChange={(e) => setButtonText(e.target.value)}
          placeholder="Открыть студию"
        />
        <TextField
          id="post-button-url"
          label="Ссылка кнопки"
          value={buttonUrl}
          onChange={(e) => setButtonUrl(e.target.value)}
          placeholder="https://creator.siteaccess.ru"
        />
      </div>

      <details className="text-caption text-ink-muted">
        <summary className="cursor-pointer">Ограничения платформ</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          <li>
            Telegram: текст до {limits.telegram.text} символов, подпись к медиа до{' '}
            {limits.telegram.caption}; галерея 2–{limits.telegram.media} фото и видео; фото до{' '}
            {limits.telegram.photo / MB} МБ, видео до {limits.telegram.video / MB} МБ; не больше ~20
            постов в минуту.
          </li>
          <li>
            MAX: текст до {limits.max.text} символов; до {limits.max.media} вложений; фото до{' '}
            {limits.max.photo / MB} МБ и 7680×7680, видео до {limits.max.video / MB} МБ; не больше 2
            сообщений в секунду.
          </li>
        </ul>
      </details>

      {notes.map((n) => (
        <p key={n} className="text-caption text-ink-muted">
          {n}
        </p>
      ))}
      {problems.length && (text || files.length) ? (
        <ul className="text-caption text-danger grid gap-1">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <StudioButton disabled={busy || problems.length > 0} onClick={() => void submit()}>
        {busy ? 'Публикуем…' : 'Опубликовать'}
      </StudioButton>
      {result.error ? <Notice error={result.error} /> : null}
      {result.results ? <Results results={result.results} /> : null}
    </div>
  )
}

function Results({ results }: { results: PostResult[] }) {
  return (
    <ul className="grid gap-1">
      {results.map((r) => (
        <li key={r.channel} className={cn('text-caption', r.ok ? 'text-success' : 'text-danger')}>
          {r.ok ? '✓' : '!'} {r.title}
          {r.ok && r.url ? (
            <>
              {' · '}
              <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                открыть
              </a>
            </>
          ) : null}
          {r.error ? ` · ${r.error}` : ''}
        </li>
      ))}
    </ul>
  )
}

function Publications() {
  const { data, setData, error } = useLoad<{ channels: Channel[]; limits: ChannelLimits }>(
    '/api/admin/channels',
  )
  const history = useLoad<{ posts: Post[] }>('/api/admin/posts')
  if (error) return <Notice error={error} />
  if (!data) return <IrisLoader size={32} label="Загрузка" />
  return (
    <div className="grid gap-8">
      <Section title="Новый пост">
        <Composer
          key={data.channels.map((c) => c.id).join()}
          channels={data.channels}
          limits={data.limits}
          onSent={history.reload}
        />
      </Section>
      <Section title="Каналы">
        <ChannelsList
          channels={data.channels}
          onChange={(channels) => setData({ ...data, channels })}
        />
      </Section>
      <Section title="История">
        {!history.data ? (
          <IrisLoader size={24} label="Загрузка" />
        ) : history.data.posts.length === 0 ? (
          <p className="text-caption text-ink-muted">Постов пока нет.</p>
        ) : (
          <ul className="divide-line border-line grid divide-y border-y">
            {history.data.posts.map((p) => (
              <li key={p.id} className="grid gap-1 py-3">
                <span className="text-caption text-ink-muted">
                  {dt(p.createdAt)} ·{' '}
                  {p.media.length
                    ? `${p.media.filter((m) => m.kind === 'photo').length} фото, ${p.media.filter((m) => m.kind === 'video').length} видео`
                    : 'текст'}
                  {p.button ? ` · кнопка «${p.button.text}»` : ''}
                </span>
                {p.text ? (
                  <span className="text-ink line-clamp-3 break-words">{p.text}</span>
                ) : null}
                <Results results={p.results} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/* ── агент публикаций ── */

interface AutopostSettings {
  enabled: boolean
  intervalMin: number
  from: string
  to: string
  kinds: { photo: boolean; video: boolean }
  channels: string[]
  autoPublish: boolean
  buttonText: string
  llmModel: string
}
interface AutopostItem {
  id: string
  kind: 'photo' | 'video'
  storyId: string
  storyTitle: string
  status: 'generating' | 'draft' | 'publishing' | 'published' | 'failed'
  step?: string
  text: string
  media: { kind: 'photo' | 'video'; src: string; thumb: string }[]
  button?: { text: string; url: string }
  results: PostResult[]
  error?: string
  model?: string
  createdAt: number
}
interface AutopostState {
  settings: AutopostSettings
  running: boolean
  nextAt?: number
  items: AutopostItem[]
}

const intervals = [
  [30, '30 минут'],
  [60, '1 час'],
  [120, '2 часа'],
  [180, '3 часа'],
  [360, '6 часов'],
  [720, '12 часов'],
  [1440, 'раз в сутки'],
] as const

const autopostStatus: Record<AutopostItem['status'], string> = {
  generating: 'Готовится',
  draft: 'Черновик',
  publishing: 'Публикуется',
  published: 'Опубликован',
  failed: 'Ошибка',
}

function AutopostDraft({
  item,
  onState,
}: {
  item: AutopostItem
  onState: (s: AutopostState) => void
}) {
  const [text, setText] = useState(item.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const editable = item.status === 'draft'

  async function act(path: string, init: RequestInit, ask?: string) {
    if (ask && !window.confirm(ask)) return
    setBusy(true)
    setError(undefined)
    try {
      onState(await api<AutopostState>(path, init))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="grid gap-2 py-4">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink">
          {item.kind === 'photo' ? 'Фотосессия' : 'Видео'} · {item.storyTitle}
        </span>
        <span
          className={cn(
            'text-caption uppercase',
            item.status === 'published'
              ? 'text-success'
              : item.status === 'failed'
                ? 'text-danger'
                : 'text-ink-muted',
          )}
        >
          {autopostStatus[item.status]}
          {item.step ? ` · ${item.step}` : ''} · {dt(item.createdAt)}
        </span>
      </span>
      {item.media.length ? (
        <ul className="grid grid-cols-4 gap-1 sm:max-w-md">
          {item.media.map((m) =>
            m.kind === 'video' ? (
              <li key={m.src} className="col-span-2 row-span-2">
                <video
                  src={m.src}
                  poster={m.thumb}
                  controls
                  playsInline
                  className="aspect-[9/16] w-full object-cover"
                />
              </li>
            ) : (
              <li key={m.src}>
                <a href={m.src} target="_blank" rel="noreferrer">
                  <img src={m.thumb} alt="" className="aspect-[3/4] w-full object-cover" />
                </a>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {editable ? (
        <textarea
          aria-label="Текст черновика"
          className="border-line bg-canvas text-ink min-h-32 border p-3"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : item.text ? (
        <p className="text-body text-ink break-words whitespace-pre-line">{item.text}</p>
      ) : null}
      {item.button ? (
        <span className="text-caption text-ink-muted break-all">
          Кнопка «{item.button.text}» → {item.button.url}
        </span>
      ) : null}
      {item.model ? (
        <span className="text-caption text-ink-muted">Текст и образ: {item.model}</span>
      ) : null}
      {item.error ? (
        <span className="text-caption text-danger line-clamp-3 break-words">{item.error}</span>
      ) : null}
      {item.results.length ? <Results results={item.results} /> : null}
      {editable || item.status === 'failed' ? (
        <div className="flex flex-wrap gap-2">
          {editable && text !== item.text ? (
            <StudioButton
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(`/api/admin/autopost/${item.id}`, jsonInit('PATCH', { text }))
              }
            >
              Сохранить текст
            </StudioButton>
          ) : null}
          {item.media.length && text === item.text ? (
            <StudioButton
              disabled={busy}
              onClick={() =>
                void act(
                  `/api/admin/autopost/${item.id}/publish`,
                  { method: 'POST' },
                  'Опубликовать этот пост в каналы?',
                )
              }
            >
              Опубликовать
            </StudioButton>
          ) : null}
          <StudioButton
            variant="quiet"
            disabled={busy}
            onClick={() =>
              void act(`/api/admin/autopost/${item.id}`, { method: 'DELETE' }, 'Удалить черновик?')
            }
          >
            Удалить
          </StudioButton>
        </div>
      ) : null}
      {error ? <Notice error={error} /> : null}
    </li>
  )
}

function Autopost() {
  const { data, setData, error, reload } = useLoad<AutopostState>('/api/admin/autopost')
  const channelsData = useLoad<{ channels: Channel[] }>('/api/admin/channels')
  const [draft, setDraft] = useState<AutopostSettings>()
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({})
  const [busy, setBusy] = useState(false)

  // Пока агент готовит или публикует пост — обновляем ход работы.
  const active =
    data?.running || data?.items.some((i) => i.status === 'generating' || i.status === 'publishing')
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(reload, 4000)
    return () => window.clearInterval(t)
  }, [active, reload])

  if (error) return <Notice error={error} />
  if (!data) return <IrisLoader size={32} label="Загрузка" />

  const cfg = draft ?? data.settings
  const channels = (channelsData.data?.channels ?? []).filter((c) => c.canPost)
  const set = (patch: Partial<AutopostSettings>) => setDraft({ ...cfg, ...patch })

  async function save(patch?: Partial<AutopostSettings>) {
    const next = { ...cfg, ...patch }
    setBusy(true)
    setMessage({})
    try {
      const res = await api<AutopostState>('/api/admin/autopost', jsonInit('PUT', next))
      setData(res)
      setDraft(res.settings)
      setMessage({ ok: res.settings.enabled ? 'Агент включён' : 'Сохранено, агент выключен' })
    } catch (e) {
      setMessage({ error: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  async function runNow(publish: boolean) {
    if (publish && !window.confirm('Сгенерировать пост и сразу опубликовать в каналы?')) return
    setBusy(true)
    setMessage({})
    try {
      setData(await api<AutopostState>('/api/admin/autopost/run', jsonInit('POST', { publish })))
      setMessage({ ok: 'Агент начал готовить пост — это займёт несколько минут' })
    } catch (e) {
      setMessage({ error: e instanceof Error ? e.message : 'Ошибка' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-8">
      <Section title="Агент публикаций">
        <p className="text-body text-ink-muted">
          Раз в заданный интервал агент выбирает сюжет каталога, генерирует фотосессию из четырёх
          кадров или ролик около 10 секунд с музыкой, пишет текст и публикует пост с кнопкой на
          сюжет. Фото и видео чередуются, сюжеты не повторяются подряд. Задачи пользователей всегда
          идут первыми: если очередь занята, агент ждёт.
        </p>
        <div className="bg-canvas-sunken grid gap-4 p-4">
          <Checkbox
            label="Агент включён"
            checked={cfg.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Как часто</span>
              <select
                className="border-line bg-canvas text-ink min-h-11 border px-3"
                value={cfg.intervalMin}
                onChange={(e) => set({ intervalMin: Number(e.target.value) })}
              >
                {intervals.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Публиковать с (МСК)</span>
              <input
                type="time"
                className="border-line bg-canvas text-ink min-h-11 border px-3"
                value={cfg.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">до (МСК)</span>
              <input
                type="time"
                className="border-line bg-canvas text-ink min-h-11 border px-3"
                value={cfg.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="grid gap-1">
            <legend className="text-caption text-ink-muted mb-1">Что публиковать</legend>
            <Checkbox
              label="Фотосессии (4 кадра)"
              checked={cfg.kinds.photo}
              onChange={(e) => set({ kinds: { ...cfg.kinds, photo: e.target.checked } })}
            />
            <Checkbox
              label="Видео (≈10 с, с музыкой)"
              checked={cfg.kinds.video}
              onChange={(e) => set({ kinds: { ...cfg.kinds, video: e.target.checked } })}
            />
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="text-caption text-ink-muted mb-1">
              Каналы (ничего не отмечено — все, где бот может публиковать)
            </legend>
            {channels.length === 0 ? (
              <p className="text-caption text-ink-muted">
                Каналов пока нет — добавьте их на вкладке «Публикации».
              </p>
            ) : (
              channels.map((c) => (
                <Checkbox
                  key={c.id}
                  label={`${platformName[c.platform]} · ${c.title}`}
                  checked={cfg.channels.includes(c.id)}
                  onChange={(e) =>
                    set({
                      channels: e.target.checked
                        ? [...cfg.channels, c.id]
                        : cfg.channels.filter((id) => id !== c.id),
                    })
                  }
                />
              ))
            )}
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="text-caption text-ink-muted mb-1">Режим</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="autopost-mode"
                checked={cfg.autoPublish}
                onChange={() => set({ autoPublish: true })}
              />
              <span className="text-ink">Публиковать сразу</span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="autopost-mode"
                checked={!cfg.autoPublish}
                onChange={() => set({ autoPublish: false })}
              />
              <span className="text-ink">Сохранять черновики — публикую сам после проверки</span>
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="autopost-button"
              label="Текст кнопки под постом"
              value={cfg.buttonText}
              maxLength={64}
              onChange={(e) => set({ buttonText: e.target.value })}
            />
            <TextField
              id="autopost-model"
              label="Запасная модель на сервере (Ollama)"
              value={cfg.llmModel}
              onChange={(e) => set({ llmModel: e.target.value })}
            />
          </div>
          <p className="text-caption text-ink-muted">
            {data.settings.enabled && data.nextAt
              ? `Следующий пост — около ${dt(data.nextAt)}.`
              : 'Агент выключен.'}{' '}
            {data.running ? 'Сейчас агент готовит пост.' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <StudioButton disabled={busy} onClick={() => void save()}>
              Сохранить
            </StudioButton>
            <StudioButton
              variant="outline"
              disabled={busy || data.running}
              onClick={() => void runNow(false)}
            >
              Сделать черновик сейчас
            </StudioButton>
            <StudioButton
              variant="quiet"
              disabled={busy || data.running}
              onClick={() => void runNow(true)}
            >
              Сделать и опубликовать
            </StudioButton>
          </div>
          <Notice {...message} />
        </div>
      </Section>
      <Section title="Посты агента">
        {data.items.length === 0 ? (
          <p className="text-caption text-ink-muted">Агент ещё ничего не готовил.</p>
        ) : (
          <ul className="divide-line border-line grid divide-y border-y">
            {data.items.map((item) => (
              <AutopostDraft
                key={`${item.id}-${item.status}-${item.text.length}`}
                item={item}
                onState={setData}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/* ── страница ── */

type Tab =
  | 'overview'
  | 'users'
  | 'tariffs'
  | 'pricing'
  | 'payments'
  | 'integrations'
  | 'posts'
  | 'autopost'
  | 'jobs'
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Сводка' },
  { id: 'users', label: 'Пользователи' },
  { id: 'tariffs', label: 'Тарифы' },
  { id: 'pricing', label: 'Цены и бонусы' },
  { id: 'payments', label: 'Оплата' },
  { id: 'integrations', label: 'Интеграции' },
  { id: 'posts', label: 'Публикации' },
  { id: 'autopost', label: 'Автопостинг' },
  { id: 'jobs', label: 'Задачи' },
]

export function AdminPage() {
  const session = useSession()
  const [tab, setTab] = useState<Tab>('overview')

  if (session.status === 'loading')
    return (
      <div className="grid min-h-64 place-items-center">
        <IrisLoader size={48} label="Загрузка" />
      </div>
    )
  if (session.me?.user.role !== 'admin')
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 pt-10">
        <Alert tone="danger" title="Нет доступа">
          Админка доступна только администраторам. Войдите под учётной записью администратора.
        </Alert>
        <a href="/login?return=/admin" className="text-accent underline">
          Войти
        </a>
      </div>
    )

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 pb-16 md:px-6">
      <div className="grid gap-2">
        <p className="text-caption tracking-label text-ink-muted uppercase">Админка</p>
        <h1 className="font-display text-title text-ink text-[2rem]">Управление студией</h1>
      </div>
      <ApertureTabs label="Разделы админки" items={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview /> : null}
      {tab === 'users' ? <Users /> : null}
      {tab === 'tariffs' ? <Tariffs /> : null}
      {tab === 'pricing' ? <Pricing /> : null}
      {tab === 'payments' ? <PaymentsPanel /> : null}
      {tab === 'integrations' ? <IntegrationsPanel /> : null}
      {tab === 'posts' ? <Publications /> : null}
      {tab === 'autopost' ? <Autopost /> : null}
      {tab === 'jobs' ? <Jobs /> : null}
    </div>
  )
}
