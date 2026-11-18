import { CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { TextField } from '@/components/ui/text-field.tsx'
import { ApiError, apiFetch, jsonInit } from '@/features/auth/http.ts'
import { useSession } from '@/features/auth/session.ts'

interface Tariff {
  id: string
  title: string
  tokens: number
  price: number
  badge?: string
}

const providerTitle: Record<string, string> = {
  yookassa: 'ЮKassa',
  tbank: 'Т-Банк',
}

/** Тарифы и оплата: ЮKassa или Т-Банк. Цена считается на сервере, сюда приходит только ссылка. */
export function TopUp() {
  const { me } = useSession()
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [providers, setProviders] = useState<string[]>([])
  const [receipts, setReceipts] = useState(false)
  const [email, setEmail] = useState(me?.user.email ?? '')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    void apiFetch('/api/tariffs')
      .then((r) => r.json() as Promise<{ tariffs: Tariff[]; payments: string[] }>)
      .then((d) => {
        setTariffs(d.tariffs)
        setProviders(d.payments ?? [])
      })
      .catch(() => setTariffs([]))
    void apiFetch('/api/payments/providers')
      .then((r) => r.json() as Promise<{ receipts: boolean }>)
      .then((d) => setReceipts(Boolean(d.receipts)))
      .catch(() => setReceipts(false))
  }, [])

  async function pay(tariffId: string, provider: string) {
    setBusy(`${tariffId}:${provider}`)
    setError(undefined)
    try {
      const res = await apiFetch(
        '/api/payments',
        jsonInit('POST', { tariffId, provider, email: email || undefined }),
      )
      const body = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !body.url) throw new ApiError(body.error ?? 'Не удалось начать оплату')
      window.location.assign(body.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать оплату')
      setBusy(undefined)
    }
  }

  if (!tariffs.length) return null
  const needEmail = receipts && !me?.user.email

  return (
    <section className="grid gap-3">
      <p className="text-caption tracking-label text-ink-muted flex items-center gap-2 uppercase">
        <span className="bg-accent h-px w-5" aria-hidden="true" />
        Пополнить баланс
      </p>
      {needEmail && providers.length ? (
        <TextField
          id="receipt-email"
          label="Почта для чека"
          type="email"
          autoComplete="email"
          hint="Чек об оплате придёт на эту почту"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {tariffs.map((t) => (
          <div key={t.id} className="chamfer-sm bg-canvas-raised grid content-start gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-ink text-lg">{t.title}</span>
              {t.badge ? (
                <span className="text-caption bg-accent-fill text-accent-ink px-2 py-0.5">
                  {t.badge}
                </span>
              ) : null}
            </div>
            <span className="text-ink text-2xl tabular-nums">{t.tokens} токенов</span>
            <span className="text-ink-muted">{t.price.toLocaleString('ru-RU')} ₽</span>
            {providers.length ? (
              providers.map((p) => (
                <StudioButton
                  key={p}
                  variant={p === providers[0] ? 'primary' : 'outline'}
                  disabled={Boolean(busy) || (needEmail && !email)}
                  onClick={() => void pay(t.id, p)}
                >
                  <span className="inline-flex items-center gap-2">
                    <CreditCard size={16} aria-hidden="true" />
                    {busy === `${t.id}:${p}` ? 'Переходим к оплате…' : (providerTitle[p] ?? p)}
                  </span>
                </StudioButton>
              ))
            ) : (
              <StudioButton variant="outline" disabled>
                Оплата скоро
              </StudioButton>
            )}
          </div>
        ))}
      </div>
      {error ? (
        <Alert tone="danger" title="Оплата">
          {error}
        </Alert>
      ) : null}
      <p className="text-caption text-ink-muted">
        {providers.length
          ? 'Оплата картой или через СБП на защищённой странице платёжной системы. Токены приходят сразу после подтверждения оплаты.'
          : 'Онлайн-оплата подключается. Пока баланс пополняется по приглашениям, ежедневным бонусам и администратором.'}
      </p>
    </section>
  )
}

interface OrderView {
  status: 'pending' | 'paid' | 'canceled' | 'failed'
  tokens: number
  title: string
}

/** После возврата со страницы оплаты: следим за заказом, пока банк не подтвердит. */
export function OrderBanner({ orderId }: { orderId: string }) {
  const { refresh } = useSession()
  const [order, setOrder] = useState<OrderView>()
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    let alive = true
    let timer = 0
    let tries = 0
    async function poll() {
      try {
        const res = await apiFetch(`/api/payments/${orderId}`, { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as OrderView
        if (!alive) return
        setOrder(next)
        if (next.status === 'paid') {
          void refresh()
          return
        }
        if (next.status !== 'pending') return
      } catch {
        // сеть — попробуем ещё раз
      }
      tries += 1
      if (tries > 40) setGaveUp(true)
      else timer = window.setTimeout(() => void poll(), 3_000)
    }
    void poll()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [orderId, refresh])

  if (!order) return <IrisLoader size={32} label="Проверяем оплату" />
  if (order.status === 'paid')
    return (
      <Alert tone="success" title="Оплата прошла">
        На баланс зачислено {order.tokens} токенов («{order.title}»).
      </Alert>
    )
  if (order.status === 'pending')
    return (
      <Alert tone="info" title="Ждём подтверждения банка">
        {gaveUp
          ? 'Платёж ещё не подтверждён. Если деньги списались, токены придут автоматически — обновите страницу позже.'
          : 'Обычно это занимает несколько секунд.'}
      </Alert>
    )
  return (
    <Alert tone="danger" title="Оплата не прошла">
      Платёж отменён или отклонён. Деньги не списаны — попробуйте ещё раз.
    </Alert>
  )
}
