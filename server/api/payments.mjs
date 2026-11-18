/**
 * Оплата тарифов: ЮKassa (API v3) и Т-Банк (Т-Касса, API v2).
 * Цена и количество токенов берутся только из тарифа на сервере. Токены начисляются один раз,
 * после подтверждения: у Т-Банка — по подписи уведомления, у ЮKassa — повторным запросом
 * статуса платежа в её API (уведомления ЮKassa не подписаны).
 */
import { createHash, randomBytes } from 'node:crypto'
import { HttpError, readJson, send } from './http.mjs'

const YOOKASSA_URL = process.env.YOOKASSA_URL ?? 'https://api.yookassa.ru/v3'
const TBANK_URL = process.env.TBANK_URL ?? 'https://securepay.tinkoff.ru/v2'

const rub = (kopecks) => (kopecks / 100).toFixed(2)

/** Подпись Т-Банка: значения скалярных полей корня + Password, по алфавиту ключей, SHA-256. */
export function tbankToken(params, password) {
  const flat = { ...params, Password: password }
  delete flat.Token
  return createHash('sha256')
    .update(
      Object.keys(flat)
        .filter((k) => flat[k] !== undefined && flat[k] !== null && typeof flat[k] !== 'object')
        .sort()
        .map((k) => String(flat[k]))
        .join(''),
    )
    .digest('hex')
}

async function jsonOrThrow(res, what) {
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${what}: неожиданный ответ ${res.status}`)
  }
  if (!res.ok) throw new Error(`${what}: ${body.description ?? body.Message ?? res.status}`)
  return body
}

export function paymentsModule({ db, accounts, config, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tariff_id TEXT NOT NULL,
      title TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_id TEXT,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id, created_at);
    CREATE INDEX IF NOT EXISTS orders_provider ON orders (provider, provider_id);
  `)
  const st = {
    insert: db.prepare(
      `INSERT INTO orders (id, user_id, tariff_id, title, tokens, amount, provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    setProviderId: db.prepare('UPDATE orders SET provider_id = ? WHERE id = ?'),
    get: db.prepare('SELECT * FROM orders WHERE id = ?'),
    byProvider: db.prepare('SELECT * FROM orders WHERE provider = ? AND provider_id = ?'),
    paid: db.prepare(
      `UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'`,
    ),
    closed: db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'`),
    recent: db.prepare(`SELECT o.*, u.name AS user_name, u.email AS user_email
      FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 100`),
    tariff: db.prepare('SELECT * FROM tariffs WHERE id = ? AND active = 1'),
  }

  const settings = () => accounts.getSetting('payments')

  function enabledProviders() {
    const p = settings()
    const out = []
    if (p.yookassa.enabled && p.yookassa.shopId && p.yookassa.secretKey) out.push('yookassa')
    if (p.tbank.enabled && p.tbank.terminalKey && p.tbank.password) out.push('tbank')
    return out
  }

  /** Зачисление токенов: ровно один раз, только из состояния «ожидает оплаты». */
  function markPaid(order, amountKopecks) {
    if (amountKopecks !== order.amount) {
      log(`заказ ${order.id.slice(0, 8)}: сумма ${amountKopecks} не совпадает с ${order.amount}`)
      return false
    }
    if (st.paid.run(Date.now(), order.id).changes !== 1) return false
    accounts.change(order.user_id, order.tokens, 'purchase', `Покупка «${order.title}»`, order.id)
    log(`заказ ${order.id.slice(0, 8)} оплачен: +${order.tokens} токенов`)
    return true
  }

  function receiptItems(order, email) {
    const p = settings()
    if (!p.receipts.enabled || !email) return undefined
    return { email, vat: p.receipts.vat, taxation: p.receipts.taxation, order }
  }

  /* ── ЮKassa ── */

  const ykAuth = () => {
    const { shopId, secretKey } = settings().yookassa
    return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`
  }

  async function yookassaCreate(order, returnUrl, email) {
    const receipt = receiptItems(order, email)
    const body = {
      amount: { value: rub(order.amount), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: `${order.title}: ${order.tokens} токенов`.slice(0, 128),
      metadata: { order_id: order.id },
      ...(receipt
        ? {
            receipt: {
              customer: { email: receipt.email },
              tax_system_code: receipt.taxation,
              items: [
                {
                  description: `Токены AI Creative Studio, ${order.tokens} шт.`.slice(0, 128),
                  quantity: '1.00',
                  amount: { value: rub(order.amount), currency: 'RUB' },
                  vat_code: receipt.vat,
                  payment_mode: 'full_payment',
                  payment_subject: 'service',
                },
              ],
            },
          }
        : {}),
    }
    const payment = await jsonOrThrow(
      await fetch(`${YOOKASSA_URL}/payments`, {
        method: 'POST',
        headers: {
          authorization: ykAuth(),
          'content-type': 'application/json',
          'idempotence-key': order.id,
        },
        body: JSON.stringify(body),
      }),
      'ЮKassa, создание платежа',
    )
    st.setProviderId.run(payment.id, order.id)
    return payment.confirmation?.confirmation_url
  }

  /** Статус всегда берётся из API ЮKassa, а не из тела уведомления. */
  async function yookassaSync(order) {
    if (!order.provider_id) return
    const payment = await jsonOrThrow(
      await fetch(`${YOOKASSA_URL}/payments/${encodeURIComponent(order.provider_id)}`, {
        headers: { authorization: ykAuth() },
      }),
      'ЮKassa, статус платежа',
    )
    if (payment.metadata?.order_id !== order.id) return
    if (payment.status === 'succeeded' && payment.paid) {
      markPaid(order, Math.round(Number(payment.amount?.value ?? 0) * 100))
    } else if (payment.status === 'canceled') {
      st.closed.run('canceled', order.id)
    }
  }

  /* ── Т-Банк ── */

  async function tbankCall(method, params) {
    const { terminalKey, password } = settings().tbank
    const body = { TerminalKey: terminalKey, ...params }
    body.Token = tbankToken(body, password)
    const res = await jsonOrThrow(
      await fetch(`${TBANK_URL}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      `Т-Банк, ${method}`,
    )
    if (res.Success === false)
      throw new Error(`Т-Банк, ${method}: ${res.Message ?? ''} ${res.Details ?? ''}`.trim())
    return res
  }

  async function tbankCreate(order, returnUrl, email) {
    const receipt = receiptItems(order, email)
    const res = await tbankCall('Init', {
      Amount: order.amount,
      OrderId: order.id,
      Description: `${order.title}: ${order.tokens} токенов`.slice(0, 140),
      SuccessURL: returnUrl,
      FailURL: returnUrl,
      NotificationURL: `${config.publicUrl}/api/payments/tbank/webhook`,
      ...(receipt
        ? {
            Receipt: {
              Email: receipt.email,
              Taxation: tbankTaxation[receipt.taxation] ?? 'usn_income',
              Items: [
                {
                  Name: `Токены AI Creative Studio, ${order.tokens} шт.`.slice(0, 128),
                  Price: order.amount,
                  Quantity: 1,
                  Amount: order.amount,
                  Tax: tbankVat[receipt.vat] ?? 'none',
                  PaymentMethod: 'full_payment',
                  PaymentObject: 'service',
                },
              ],
            },
          }
        : {}),
    })
    st.setProviderId.run(String(res.PaymentId), order.id)
    return res.PaymentURL
  }

  async function tbankSync(order) {
    if (!order.provider_id) return
    const res = await tbankCall('GetState', { PaymentId: order.provider_id })
    if (res.OrderId !== order.id) return
    if (res.Status === 'CONFIRMED') markPaid(order, Number(res.Amount))
    else if (['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED'].includes(res.Status))
      st.closed.run('canceled', order.id)
  }

  const tbankTaxation = {
    1: 'osn',
    2: 'usn_income',
    3: 'usn_income_outcome',
    5: 'esn',
    6: 'patent',
  }
  const tbankVat = { 1: 'none', 2: 'vat0', 3: 'vat10', 4: 'vat20', 11: 'vat22' }

  async function sync(order) {
    if (order.status !== 'pending') return order
    try {
      if (order.provider === 'yookassa') await yookassaSync(order)
      else if (order.provider === 'tbank') await tbankSync(order)
    } catch (error) {
      log(`заказ ${order.id.slice(0, 8)}: проверка статуса — ${error.message}`)
    }
    return st.get.get(order.id)
  }

  const view = (o) => ({
    id: o.id,
    title: o.title,
    tokens: o.tokens,
    amount: o.amount / 100,
    provider: o.provider,
    status: o.status,
    createdAt: o.created_at,
    paidAt: o.paid_at ?? undefined,
  })

  return {
    enabledProviders,
    recent: () =>
      st.recent.all().map((o) => ({
        ...view(o),
        user: o.user_name ? `${o.user_name}${o.user_email ? ` · ${o.user_email}` : ''}` : '—',
      })),

    async handle(req, res, path, user) {
      const method = req.method

      // Уведомление Т-Банка: подпись проверяется паролем терминала; ответ — строка OK.
      if (method === 'POST' && path === '/api/payments/tbank/webhook') {
        const body = await readJson(req)
        const { password, terminalKey } = settings().tbank
        if (
          !password ||
          body.TerminalKey !== terminalKey ||
          tbankToken(body, password) !== body.Token
        ) {
          log('Т-Банк: уведомление с неверной подписью отклонено')
          res.writeHead(400, { 'content-type': 'text/plain' })
          return res.end('BAD TOKEN')
        }
        const order = st.get.get(String(body.OrderId))
        if (order && order.provider === 'tbank') {
          if (body.Status === 'CONFIRMED' && body.Success !== false)
            markPaid(order, Number(body.Amount))
          else if (['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED'].includes(body.Status))
            st.closed.run('canceled', order.id)
        }
        res.writeHead(200, { 'content-type': 'text/plain' })
        return res.end('OK')
      }

      // Уведомление ЮKassa: телу не доверяем — статус перепроверяется запросом в API.
      if (method === 'POST' && path === '/api/payments/yookassa/webhook') {
        const body = await readJson(req)
        const paymentId = String(body.object?.id ?? '')
        const order = paymentId ? st.byProvider.get('yookassa', paymentId) : undefined
        if (order) await sync(order)
        return send(res, 200, { ok: true })
      }

      if (method === 'GET' && path === '/api/payments/providers') {
        return send(res, 200, {
          providers: enabledProviders(),
          receipts: settings().receipts.enabled,
        })
      }

      if (method === 'POST' && path === '/api/payments') {
        if (!user) throw new HttpError(401, 'Войдите в аккаунт')
        const body = await readJson(req)
        const provider = String(body.provider ?? '')
        if (!enabledProviders().includes(provider))
          throw new HttpError(400, 'Этот способ оплаты выключен')
        const tariff = st.tariff.get(String(body.tariffId ?? ''))
        if (!tariff || tariff.price <= 0) throw new HttpError(404, 'Тариф не найден')
        const email = String(body.email ?? user.email ?? '')
          .trim()
          .toLowerCase()
        if (settings().receipts.enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new HttpError(400, 'Укажите почту — на неё придёт чек')

        const id = randomBytes(12).toString('hex')
        st.insert.run(
          id,
          user.id,
          tariff.id,
          tariff.title,
          tariff.tokens,
          tariff.price * 100,
          provider,
          Date.now(),
        )
        const order = st.get.get(id)
        const returnUrl = `${config.publicUrl}/cabinet?order=${id}`
        try {
          const url =
            provider === 'yookassa'
              ? await yookassaCreate(order, returnUrl, email)
              : await tbankCreate(order, returnUrl, email)
          if (!url) throw new Error('платёжная система не вернула ссылку на оплату')
          log(`заказ ${id.slice(0, 8)}: ${provider}, ${tariff.price} ₽`)
          return send(res, 201, { orderId: id, url })
        } catch (error) {
          st.closed.run('failed', id)
          log(`заказ ${id.slice(0, 8)}: ${error.message}`)
          throw new HttpError(
            502,
            'Платёжная система не ответила. Попробуйте ещё раз или выберите другой способ.',
          )
        }
      }

      const match = /^\/api\/payments\/([0-9a-f]{24})$/.exec(path)
      if (method === 'GET' && match) {
        if (!user) throw new HttpError(401, 'Войдите в аккаунт')
        const order = st.get.get(match[1])
        if (!order || (order.user_id !== user.id && user.role !== 'admin'))
          throw new HttpError(404, 'Заказ не найден')
        return send(res, 200, view(await sync(order)))
      }

      return undefined
    },
  }
}
