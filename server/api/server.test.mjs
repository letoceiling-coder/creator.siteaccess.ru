/** Тесты API без GPU: npm run test:api */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash, createHmac } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { tbankToken } from './payments.mjs'

const port = 3900 + Math.floor(Math.random() * 500)
const base = `http://127.0.0.1:${port}`
const dir = mkdtempSync(join(tmpdir(), 'creator-api-'))
const photo = readFileSync(new URL('../../src/assets/playground/portrait-day.jpg', import.meta.url))
const env = {
  ...process.env,
  PORT: String(port),
  DATA_DIR: dir,
  MEDIA_DIR: dir,
  WORKER: 'off',
  FACE_CHECK: 'off',
  INSECURE_COOKIES: '1',
  LOGIN_LIMIT: '1000',
  REGISTER_LIMIT: '1000',
  PUBLIC_URL: 'https://creator.example',
}
let child

/* ── Поддельные ЮKassa и Т-Банк: настоящие платёжные API в тестах не вызываются ── */
const fake = { yk: new Map(), tb: new Map(), ykAmountOverride: undefined, max: [] }
const fakePort = 4400 + Math.floor(Math.random() * 500)
const fakeServer = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  const reply = (data, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  if (req.url === '/yk/payments' && req.method === 'POST') {
    assert.equal(
      req.headers.authorization,
      `Basic ${Buffer.from('123:test_sk').toString('base64')}`,
    )
    assert.ok(req.headers['idempotence-key'])
    const id = `yk-${fake.yk.size + 1}`
    fake.yk.set(id, {
      id,
      status: 'pending',
      paid: false,
      amount: body.amount,
      metadata: body.metadata,
    })
    return reply({
      ...fake.yk.get(id),
      confirmation: { confirmation_url: `https://pay.example/${id}` },
    })
  }
  const yk = /^\/yk\/payments\/(.+)$/.exec(req.url ?? '')
  if (yk && req.method === 'GET') {
    const payment = fake.yk.get(decodeURIComponent(yk[1]))
    return reply(
      fake.ykAmountOverride ? { ...payment, amount: { value: fake.ykAmountOverride } } : payment,
    )
  }
  if (req.url === '/tb/Init') {
    assert.equal(body.Token, tbankToken(body, 'pw'))
    const id = String(9000 + fake.tb.size)
    fake.tb.set(id, { OrderId: body.OrderId, Amount: body.Amount, Status: 'NEW' })
    return reply({ Success: true, PaymentId: id, PaymentURL: `https://pay.example/tb/${id}` })
  }
  if (req.url === '/tb/GetState') {
    const p = fake.tb.get(String(body.PaymentId))
    return reply({ Success: true, PaymentId: body.PaymentId, ...p })
  }
  if (req.url === '/max/me')
    return reply({ user_id: 1, username: 'studio_max_bot', name: 'Studio' })
  if (req.url === '/max/subscriptions') {
    if (req.method === 'POST') {
      fake.maxSubs = [{ url: body.url, update_types: body.update_types }]
      assert.match(body.secret, /^[a-f0-9]{48}$/)
      return reply({ success: true })
    }
    return reply({ subscriptions: fake.maxSubs ?? [] })
  }
  if (req.url?.startsWith('/max/messages') || req.url?.startsWith('/max/answers')) {
    assert.equal(req.headers.authorization, 'max-test-token')
    fake.max.push({ url: req.url, body })
    return reply({ success: true })
  }
  reply({ error: 'not found' }, 404)
})
env.YOOKASSA_URL = `http://127.0.0.1:${fakePort}/yk`
env.TBANK_URL = `http://127.0.0.1:${fakePort}/tb`
env.MAX_API_URL = `http://127.0.0.1:${fakePort}/max`

before(async () => {
  await new Promise((resolve) => fakeServer.listen(fakePort, '127.0.0.1', resolve))
  // Администратор создаётся консольной командой, пароль — только через окружение.
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./cli.mjs', import.meta.url)),
      'create-user',
      '--email',
      'admin@test.ru',
      '--name',
      'Админ',
      '--role',
      'admin',
    ],
    { env: { ...env, CS_PASSWORD: 'admin-pass-123' } },
  )
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env,
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('API не стартовал')
})

after(async () => {
  fakeServer.close()
  child.kill()
  await once(child, 'exit')
  rmSync(dir, { recursive: true, force: true })
})

/** Клиент с cookie сессии. */
function client() {
  const jar = new Map()
  return async (path, { method = 'GET', json, body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
      redirect: 'manual',
    })
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(';')
      const i = pair.indexOf('=')
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: res.status, data }
  }
}

function form(fields, files = [photo]) {
  const f = new FormData()
  const all = {
    kind: 'photo',
    target: 'north',
    outfit: '0',
    time: 'day',
    consent: 'yes',
    ...fields,
  }
  for (const [k, v] of Object.entries(all)) if (v !== undefined) f.append(k, v)
  for (const [i, file] of files.entries()) f.append('photos', new Blob([file]), `p${i}.jpg`)
  return f
}

let n = 0
async function newUser(extra = {}) {
  const call = client()
  n += 1
  const res = await call('/api/auth/register', {
    method: 'POST',
    json: {
      email: `user${n}@test.ru`,
      password: 'password-123',
      name: `Пользователь ${n}`,
      ...extra,
    },
  })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  return { call, me: res.data }
}

async function admin() {
  const call = client()
  const res = await call('/api/auth/login', {
    method: 'POST',
    json: { email: 'admin@test.ru', password: 'admin-pass-123' },
  })
  assert.equal(res.status, 200)
  assert.equal(res.data.user.role, 'admin')
  return call
}

test('регистрация даёт бонус, вход и выход работают', async () => {
  const { call, me } = await newUser()
  assert.equal(me.user.balance, 30)
  assert.equal((await call('/api/me')).data.user.name, me.user.name)
  await call('/api/auth/logout', { method: 'POST' })
  assert.equal((await call('/api/me')).data.user, null)
  const bad = await client()('/api/auth/login', {
    method: 'POST',
    json: { email: me.user.email, password: 'wrong-password' },
  })
  assert.equal(bad.status, 401)
})

test('задачи только для вошедших, токены списываются и возвращаются при отмене', async () => {
  assert.equal((await client()('/api/jobs', { method: 'POST', body: form({}) })).status, 401)
  const { call } = await newUser()
  const created = await call('/api/jobs', { method: 'POST', body: form({}) })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  assert.equal(created.data.cost, 10)
  assert.equal((await call('/api/me')).data.user.balance, 20)

  // Чужой пользователь задачу не видит.
  const other = await newUser()
  assert.equal((await other.call(`/api/jobs/${created.data.id}`)).status, 404)

  const cancelled = await call(`/api/jobs/${created.data.id}/cancel`, { method: 'POST' })
  assert.equal(cancelled.data.status, 'cancelled')
  assert.equal(cancelled.data.refunded, true)
  assert.equal((await call('/api/me')).data.user.balance, 30)
  const wallet = await call('/api/wallet')
  assert.deepEqual(
    wallet.data.history.map((h) => h.reason),
    ['refund', 'job', 'signup'],
  )
  assert.equal((await call('/api/jobs')).data.jobs.length, 1)
})

test('нехватка токенов, бесплатные токены только при нулевом балансе', async () => {
  const adm = await admin()
  const { call, me } = await newUser()
  // Обнуляем баланс — бесплатные токены придут один раз за сутки.
  await adm(`/api/admin/users/${me.user.id}/tokens`, { method: 'POST', json: { delta: -30 } })
  assert.equal((await call('/api/me')).data.user.balance, 10)
  assert.equal((await call('/api/me')).data.user.balance, 10)
  const video = await call('/api/jobs', {
    method: 'POST',
    body: form({ kind: 'video', target: 'couple-hug' }, [photo, photo]),
  })
  assert.equal(video.status, 402)
  assert.match(video.data.error, /нужно 30/)
})

test('приглашение: бонус приглашённому сразу', async () => {
  const inviter = await newUser()
  const invited = await newUser({ ref: inviter.me.user.refCode })
  assert.equal(invited.me.user.balance, 40)
  assert.match(inviter.me.referralUrl, /\?ref=/)
})

test('проверки запроса задачи', async () => {
  const { call } = await newUser()
  const post = (fields, files) => call('/api/jobs', { method: 'POST', body: form(fields, files) })
  assert.equal((await post({ consent: undefined })).status, 400)
  assert.equal((await post({ target: 'unknown' })).status, 404)
  assert.equal((await post({ target: '../etc' })).status, 400)
  assert.equal((await post({ time: 'constructor' })).status, 400)
  assert.equal((await post({}, [])).status, 400)
  assert.equal((await post({}, [photo, photo, photo, photo])).status, 400)
  assert.equal((await post({}, [Buffer.from('<?php echo 1; ?> just text here')])).status, 415)
  assert.equal((await post({ kind: 'video', target: 'couple-hug' })).status, 400)
  assert.equal((await post({ kind: 'animate', target: 'wind', duration: '7' })).status, 400)
})

test('запрос с чужого сайта отклоняется', async () => {
  const res = await client()('/api/auth/login', {
    method: 'POST',
    json: { email: 'admin@test.ru', password: 'admin-pass-123' },
    headers: { origin: 'https://evil.example' },
  })
  assert.equal(res.status, 403)
})

test('админка: доступ, цены, тарифы, секреты интеграций не отдаются', async () => {
  const { call } = await newUser()
  assert.equal((await call('/api/admin/stats')).status, 403)
  const adm = await admin()
  assert.equal((await adm('/api/admin/stats')).status, 200)

  const settings = await adm('/api/admin/settings')
  const updated = await adm('/api/admin/settings', {
    method: 'PUT',
    json: { ...settings.data, prices: { ...settings.data.prices, photo: 12 } },
  })
  assert.equal(updated.data.prices.photo, 12)

  const tariffs = await adm('/api/admin/tariffs', {
    method: 'POST',
    json: { id: 'mega', title: 'Мега', tokens: 5000, price: 4990 },
  })
  assert.equal(tariffs.status, 201)
  assert.ok((await client()('/api/tariffs')).data.tariffs.some((t) => t.id === 'mega'))

  const saved = await adm('/api/admin/integrations', {
    method: 'PUT',
    json: {
      telegram: { enabled: true, botUsername: 'test_bot', botToken: '123456:SECRET-TOKEN-abcd' },
    },
  })
  const tg = saved.data.integrations.telegram
  assert.equal(tg.botToken.set, true)
  assert.equal(tg.botToken.hint, '••••abcd')
  assert.ok(!JSON.stringify(saved.data).includes('SECRET-TOKEN'))
  // Пустое поле секрета не стирает сохранённый ключ.
  const again = await adm('/api/admin/integrations', {
    method: 'PUT',
    json: { telegram: { botToken: '' } },
  })
  assert.equal(again.data.integrations.telegram.botToken.set, true)
})

test('вход из мини-приложения Telegram проверяет подпись', async () => {
  const botToken = '123456:SECRET-TOKEN-abcd' // задан в предыдущем тесте
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 777, first_name: 'Мини', last_name: 'Апп' }),
    query_id: 'AAA',
  })
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))

  const ok = await client()('/api/auth/webapp', {
    method: 'POST',
    json: { platform: 'telegram', initData: params.toString() },
  })
  assert.equal(ok.status, 200, JSON.stringify(ok.data))
  assert.equal(ok.data.user.name, 'Мини Апп')
  assert.deepEqual(ok.data.user.providers, ['telegram'])

  params.set('hash', '0'.repeat(64))
  const bad = await client()('/api/auth/webapp', {
    method: 'POST',
    json: { platform: 'telegram', initData: params.toString() },
  })
  assert.equal(bad.status, 401)
})

test('оплата ЮKassa: статус перепроверяется в API, токены начисляются один раз', async () => {
  const adm = await admin()
  const saved = await adm('/api/admin/payments', {
    method: 'PUT',
    json: {
      yookassa: { enabled: true, shopId: '123', secretKey: 'test_sk' },
      tbank: { enabled: true, terminalKey: 'TDEMO', password: 'pw' },
    },
  })
  assert.equal(saved.data.payments.yookassa.secretKey.set, true)
  assert.ok(!JSON.stringify(saved.data).includes('test_sk'))
  assert.deepEqual((await client()('/api/tariffs')).data.payments, ['yookassa', 'tbank'])

  const { call } = await newUser()
  const order = await call('/api/payments', {
    method: 'POST',
    json: { tariffId: 'start', provider: 'yookassa' },
  })
  assert.equal(order.status, 201, JSON.stringify(order.data))
  assert.match(order.data.url, /^https:\/\/pay\.example\//)
  assert.equal((await call(`/api/payments/${order.data.orderId}`)).data.status, 'pending')

  // Уведомление о «успехе», пока ЮKassa говорит pending, ничего не начисляет.
  const hook = { event: 'payment.succeeded', object: { id: 'yk-1' } }
  await client()('/api/payments/yookassa/webhook', { method: 'POST', json: hook })
  assert.equal((await call('/api/me')).data.user.balance, 30)

  Object.assign(fake.yk.get('yk-1'), { status: 'succeeded', paid: true })
  await client()('/api/payments/yookassa/webhook', { method: 'POST', json: hook })
  await client()('/api/payments/yookassa/webhook', { method: 'POST', json: hook })
  assert.equal((await call('/api/me')).data.user.balance, 130)
  assert.equal((await call(`/api/payments/${order.data.orderId}`)).data.status, 'paid')

  // Чужой пользователь заказ не видит.
  const other = await newUser()
  assert.equal((await other.call(`/api/payments/${order.data.orderId}`)).status, 404)
})

test('оплата ЮKassa: подменённая сумма не зачисляется', async () => {
  const { call } = await newUser()
  const order = await call('/api/payments', {
    method: 'POST',
    json: { tariffId: 'start', provider: 'yookassa' },
  })
  const id = [...fake.yk.keys()].at(-1)
  Object.assign(fake.yk.get(id), { status: 'succeeded', paid: true })
  fake.ykAmountOverride = '1.00'
  await call(`/api/payments/${order.data.orderId}`)
  fake.ykAmountOverride = undefined
  assert.equal((await call('/api/me')).data.user.balance, 30)
})

test('оплата Т-Банк: подпись уведомления, сумма и однократность', async () => {
  const { call } = await newUser()
  const order = await call('/api/payments', {
    method: 'POST',
    json: { tariffId: 'optimal', provider: 'tbank' },
  })
  assert.equal(order.status, 201, JSON.stringify(order.data))
  const paymentId = [...fake.tb.keys()].at(-1)
  const notice = {
    TerminalKey: 'TDEMO',
    OrderId: order.data.orderId,
    Success: true,
    Status: 'CONFIRMED',
    PaymentId: Number(paymentId),
    ErrorCode: '0',
    Amount: 49000,
  }
  const hook = (data) =>
    fetch(`${base}/api/payments/tbank/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })

  const forged = await hook({ ...notice, Token: '0'.repeat(64) })
  assert.equal(forged.status, 400)
  assert.equal((await call('/api/me')).data.user.balance, 30)

  const wrongAmount = { ...notice, Amount: 100 }
  await hook({ ...wrongAmount, Token: tbankToken(wrongAmount, 'pw') })
  assert.equal((await call('/api/me')).data.user.balance, 30)

  const ok = await hook({ ...notice, Token: tbankToken(notice, 'pw') })
  assert.equal(await ok.text(), 'OK')
  await hook({ ...notice, Token: tbankToken(notice, 'pw') })
  assert.equal((await call('/api/me')).data.user.balance, 330)
})

test('вход на сайте через бота MAX: подтверждение кнопкой, сессия только у этого браузера', async () => {
  const adm = await admin()
  await adm('/api/admin/integrations', {
    method: 'PUT',
    json: { max: { enabled: true, botToken: 'max-test-token', botUsername: 'studio_max_bot' } },
  })
  // До настройки вебхука кнопки входа через MAX нет.
  let providers = (await client()('/api/auth/providers')).data.providers
  assert.ok(!providers.some((p) => p.id === 'max'))
  const setup = await adm('/api/admin/bots/max/setup', { method: 'POST' })
  assert.equal(setup.status, 200, JSON.stringify(setup.data))
  assert.equal(setup.data.status.webhookOk, true)
  providers = (await client()('/api/auth/providers')).data.providers
  assert.ok(providers.some((p) => p.id === 'max' && p.url === 'link:max'))

  const browser = client()
  const start = await browser('/api/auth/link/start', { method: 'POST', json: { platform: 'max' } })
  assert.equal(start.status, 201)
  const { code, url } = start.data
  assert.equal(url, `https://max.ru/studio_max_bot?start=login_${code}`)
  assert.equal((await browser(`/api/auth/link/${code}`)).data.status, 'pending')

  const secret = createHash('sha256')
    .update('creator-webhook:max-test-token')
    .digest('hex')
    .slice(0, 48)
  const hook = (body, key = secret) =>
    fetch(`${base}/api/bots/max/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-max-bot-api-secret': key },
      body: JSON.stringify(body),
    })
  assert.equal((await hook({ update_type: 'bot_started' }, 'wrong-secret')).status, 403)

  const user = { user_id: 4242, first_name: 'Макс', last_name: 'Тест', name: 'Макс Тест' }
  await hook({ update_type: 'bot_started', user, payload: `login_${code}` })
  await new Promise((r) => setTimeout(r, 300))
  const ask = fake.max.at(-1)
  assert.match(ask.url, /^\/max\/messages\?user_id=4242/)
  const button = ask.body.attachments[0].payload.buttons[0][0]
  assert.equal(button.type, 'callback')
  assert.equal(button.payload, `confirm_login:${code}`)

  await hook({
    update_type: 'message_callback',
    callback: { callback_id: 'cb1', payload: `confirm_login:${code}`, user },
  })
  await new Promise((r) => setTimeout(r, 300))
  assert.match(fake.max.at(-1).url, /^\/max\/answers\?callback_id=cb1/)

  // Чужой браузер с тем же кодом сессию не получает.
  assert.equal((await client()(`/api/auth/link/${code}`)).status, 404)
  const done = await browser(`/api/auth/link/${code}`)
  assert.equal(done.data.status, 'confirmed')
  const me = await browser('/api/me')
  assert.equal(me.data.user.name, 'Макс Тест')
  assert.deepEqual(me.data.user.providers, ['max'])
  assert.equal((await browser(`/api/auth/link/${code}`)).data.status, 'used')
})
