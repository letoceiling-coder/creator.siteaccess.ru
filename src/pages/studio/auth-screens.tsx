import { ChevronRight, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { TextField } from '@/components/ui/text-field.tsx'
import { BrandIcon } from '@/components/studio/brand-icons.tsx'
import { ApiError, apiFetch, jsonInit } from '@/features/auth/http.ts'
import { cn } from '@/shared/cn.ts'
import {
  fetchProviders,
  login,
  loginTelegram,
  register,
  savedRef,
  useSession,
} from '@/features/auth/session.ts'

type Provider = { id: string; title: string; url: string }

/** Ожидание подтверждения входа в боте (Telegram, MAX). */
function BotLogin({
  provider,
  onDone,
  onCancel,
}: {
  provider: Provider
  onDone: () => void
  onCancel: () => void
}) {
  const { refresh } = useSession()
  const [link, setLink] = useState<{ code: string; url: string }>()
  const [status, setStatus] = useState<'starting' | 'pending' | 'expired' | 'error'>('starting')
  const [error, setError] = useState<string>()
  const platform = provider.url.slice(5)

  useEffect(() => {
    let alive = true
    let timer = 0
    async function poll(code: string, tries: number) {
      try {
        const res = await apiFetch(`/api/auth/link/${code}`, { cache: 'no-store' })
        const body = (await res.json()) as { status?: string }
        if (!alive) return
        if (body.status === 'confirmed') {
          await refresh()
          onDone()
          return
        }
        if (body.status === 'expired' || body.status === 'used' || tries > 150) {
          setStatus('expired')
          return
        }
      } catch {
        // сеть — пробуем дальше
      }
      timer = window.setTimeout(() => void poll(code, tries + 1), 2000)
    }
    void (async () => {
      try {
        const res = await apiFetch(
          '/api/auth/link/start',
          jsonInit('POST', { platform, ref: savedRef() }),
        )
        const body = (await res.json()) as { code?: string; url?: string; error?: string }
        if (!res.ok || !body.code || !body.url)
          throw new Error(body.error ?? 'Не удалось начать вход')
        if (!alive) return
        setLink({ code: body.code, url: body.url })
        setStatus('pending')
        window.open(body.url, '_blank', 'noopener')
        void poll(body.code, 0)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Не удалось начать вход')
        setStatus('error')
      }
    })()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [platform, refresh, onDone])

  return (
    <div className="chamfer bg-canvas-raised grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <BrandIcon id={provider.id} />
        <span className="font-display text-ink text-lg">Вход через {provider.title}</span>
      </div>
      {status === 'error' ? (
        <Alert tone="danger" title="Не получилось">
          {error}
        </Alert>
      ) : status === 'expired' ? (
        <Alert tone="info" title="Время вышло">
          Подтверждение не пришло. Нажмите «Войти через {provider.title}» ещё раз.
        </Alert>
      ) : (
        <>
          <ol className="text-body text-ink-muted grid list-decimal gap-1 pl-5">
            <li>Откроется бот студии в {provider.title}.</li>
            <li>Нажмите в нём «Запустить» и затем «Подтвердить вход».</li>
            <li>Вернитесь сюда — вход произойдёт сам.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <IrisLoader size={28} label="Ждём подтверждения" />
            <span className="text-caption text-ink-muted">
              Ждём подтверждения в {provider.title}…
            </span>
          </div>
          {link ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="chamfer-sm bg-canvas-overlay text-ink inline-flex min-h-11 items-center justify-center px-4 font-medium"
            >
              Открыть бота ещё раз
            </a>
          ) : null}
        </>
      )}
      <StudioButton variant="quiet" onClick={onCancel}>
        Другой способ входа
      </StudioButton>
    </div>
  )
}

/** Вход и регистрация: почта или быстрый вход через Яндекс, VK ID, Telegram. */
export function LoginScreen({
  returnTo,
  error: initialError,
  onDone,
}: {
  returnTo: string
  error?: string
  onDone: () => void
}) {
  const { setMe } = useSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [providers, setProviders] = useState<Provider[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchProviders()
      .then((p) => setProviders(p.providers))
      .catch(() => setProviders([]))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      setMe(mode === 'login' ? await login(email, password) : await register(email, password, name))
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось войти')
      setBusy(false)
    }
  }

  const [botProvider, setBotProvider] = useState<Provider>()
  const ref = savedRef()
  const startUrl = (p: Provider) => {
    const q = new URLSearchParams({ return: returnTo })
    if (ref) q.set('ref', ref)
    return `${p.url}?${q}`
  }

  return (
    <div className="mx-auto grid max-w-md gap-6 px-4 pt-8 pb-16 md:px-6">
      <div className="grid gap-2">
        <h1 className="font-display text-title text-ink text-[2rem]">
          {mode === 'login' ? 'Вход' : 'Регистрация'}
        </h1>
        <p className="text-body text-ink-muted">
          Создавать фотосессии и видео можно после входа. Новым пользователям — бонусные токены.
        </p>
      </div>

      {botProvider ? (
        <BotLogin
          provider={botProvider}
          onDone={onDone}
          onCancel={() => setBotProvider(undefined)}
        />
      ) : providers.length ? (
        <div className="grid gap-2">
          <div className={cn('grid gap-2', providers.length > 1 && 'sm:grid-cols-2')}>
            {providers.map((p, i) => {
              // При нечётном числе способов последний занимает всю ширину — без пустой ячейки.
              const wide = providers.length % 2 === 1 && i === providers.length - 1
              const className = cn(
                'chamfer-sm bg-canvas-raised hover:bg-canvas-overlay text-ink transition-studio flex min-h-12 w-full items-center gap-3 px-4 text-left font-medium',
                wide && 'sm:col-span-2',
              )
              const content = (
                <>
                  <BrandIcon id={p.id} />
                  <span className="flex-1">{p.title}</span>
                  <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
                </>
              )
              return p.url.startsWith('link:') ? (
                <button
                  key={p.id}
                  type="button"
                  className={className}
                  aria-label={`Войти через ${p.title}`}
                  onClick={() => setBotProvider(p)}
                >
                  {content}
                </button>
              ) : (
                <a
                  key={p.id}
                  href={startUrl(p)}
                  className={className}
                  aria-label={`Войти через ${p.title}`}
                >
                  {content}
                </a>
              )
            })}
          </div>
          <p className="text-caption text-ink-muted text-center">или по почте</p>
        </div>
      ) : null}

      <ApertureTabs
        label="Способ"
        items={[
          { id: 'login', label: 'Вход' },
          { id: 'register', label: 'Регистрация' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <form className="grid gap-4" onSubmit={(e) => void submit(e)}>
        {mode === 'register' ? (
          <TextField
            id="name"
            label="Имя"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}
        <TextField
          id="email"
          label="Почта"
          type="email"
          autoComplete="email"
          required
          icon={<Mail size={18} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="password"
          label="Пароль"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          hint={mode === 'register' ? 'Не короче 8 символов' : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? (
          <Alert tone="danger" title="Не получилось">
            {error}
          </Alert>
        ) : null}
        <StudioButton type="submit" arrow={!busy} disabled={busy}>
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </StudioButton>
      </form>
      {ref && mode === 'register' ? (
        <p className="text-caption text-ink-muted">
          Вы пришли по приглашению — после регистрации придут бонусные токены.
        </p>
      ) : null}
    </div>
  )
}

/** Возврат со страницы oauth.telegram.org: данные приходят в #tgAuthResult. */
/** Данные входа из #tgAuthResult (base64 JSON), которые возвращает oauth.telegram.org. */
function readTelegramResult(): { data?: Record<string, unknown>; error?: string } {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get('tgAuthResult')
  if (!raw) return { error: 'Telegram не передал данные входа' }
  try {
    return {
      data: JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>,
    }
  } catch {
    return { error: 'Не удалось прочитать ответ Telegram' }
  }
}

/** Возврат со страницы oauth.telegram.org: данные приходят в #tgAuthResult. */
export function TelegramCallbackScreen({ onDone }: { onDone: () => void }) {
  const { setMe } = useSession()
  const [result] = useState(readTelegramResult)
  const [loginError, setLoginError] = useState<string>()
  const error = result.error ?? loginError

  useEffect(() => {
    if (!result.data) return
    loginTelegram(result.data)
      .then((me) => {
        setMe(me)
        onDone()
      })
      .catch((e: unknown) => setLoginError(e instanceof ApiError ? e.message : 'Не удалось войти'))
  }, [onDone, result.data, setMe])

  return (
    <div className="grid min-h-64 place-items-center px-4 pt-16 text-center">
      {error ? (
        <Alert tone="danger" title="Вход через Telegram">
          {error}
        </Alert>
      ) : (
        <IrisLoader size={48} label="Входим через Telegram" />
      )}
    </div>
  )
}
