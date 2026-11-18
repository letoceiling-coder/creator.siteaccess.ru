import { LogIn, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { ApertureTabs } from '@/components/studio/aperture-tabs.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { TextField } from '@/components/ui/text-field.tsx'
import { ApiError } from '@/features/auth/http.ts'
import {
  fetchProviders,
  login,
  loginTelegram,
  register,
  savedRef,
  useSession,
} from '@/features/auth/session.ts'

type Provider = { id: string; title: string; url: string }

const providerStyle: Record<string, string> = {
  yandex: 'bg-[#fc3f1d] text-white',
  vk: 'bg-[#0077ff] text-white',
  telegram: 'bg-[#229ed9] text-white',
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

      {providers.length ? (
        <div className="grid gap-2">
          {providers.map((p) => (
            <a
              key={p.id}
              href={startUrl(p)}
              className={`chamfer-sm inline-flex min-h-12 items-center justify-center gap-2 font-medium ${providerStyle[p.id] ?? 'bg-canvas-raised text-ink'}`}
            >
              <LogIn size={18} aria-hidden="true" /> Войти через {p.title}
            </a>
          ))}
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
