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
  bonuses: { signup: number; daily: number; referrer: number; invitee: number }
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

/* ── страница ── */

type Tab = 'overview' | 'users' | 'tariffs' | 'pricing' | 'payments' | 'integrations' | 'jobs'
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Сводка' },
  { id: 'users', label: 'Пользователи' },
  { id: 'tariffs', label: 'Тарифы' },
  { id: 'pricing', label: 'Цены и бонусы' },
  { id: 'payments', label: 'Оплата' },
  { id: 'integrations', label: 'Интеграции' },
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
      {tab === 'jobs' ? <Jobs /> : null}
    </div>
  )
}
