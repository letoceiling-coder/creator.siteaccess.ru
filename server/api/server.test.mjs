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
import { inWindow, nextRunAt } from './autopost.mjs'

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
const fake = {
  yk: new Map(),
  tb: new Map(),
  ykAmountOverride: undefined,
  max: [],
  tg: [],
  maxUploads: [],
  maxNotReady: 0,
}
const fakePort = 4400 + Math.floor(Math.random() * 500)
const fakeServer = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks)
  const type = req.headers['content-type'] ?? ''
  let body = {}
  let parts
  if (type.startsWith('multipart/form-data')) {
    parts = await new Request('http://x/', {
      method: 'POST',
      headers: { 'content-type': type },
      body: raw,
    }).formData()
    for (const [k, v] of parts) if (typeof v === 'string') body[k] = v
  } else if (raw.length) body = JSON.parse(raw.toString())
  const reply = (data, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  // Telegram Bot API (публикации в канал).
  const tgm = /^\/tg\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '')
  if (tgm) {
    assert.equal(tgm[1], '123456:SECRET-TOKEN-abcd')
    const method = tgm[2]
    const files = parts
      ? [...parts]
          .filter(([, v]) => typeof v !== 'string')
          .map(([k, v]) => ({ field: k, size: v.size, type: v.type }))
      : []
    fake.tg.push({ method, body, files })
    if (method === 'getMe') return reply({ ok: true, result: { id: 99, username: 'test_bot' } })
    if (method === 'getChat')
      return body.chat_id === '@neeklo_ai' || body.chat_id === '-100500'
        ? reply({
            ok: true,
            result: { id: -100500, type: 'channel', title: 'Studio', username: 'neeklo_ai' },
          })
        : reply({ ok: false, description: 'Bad Request: chat not found' })
    if (method === 'getChatMember')
      return String(body.user_id) === '99'
        ? reply({ ok: true, result: { status: 'administrator', can_post_messages: true } })
        : reply({ ok: true, result: { status: fake.tgMember ?? 'left' } })
    const id = 100 + fake.tg.length
    if (method === 'sendMediaGroup')
      return reply({
        ok: true,
        result: JSON.parse(body.media).map((_m, i) => ({ message_id: id + i })),
      })
    return reply({ ok: true, result: { message_id: id } })
  }
  // OpenRouter: список моделей и ответы; fake.orDown — сервис недоступен.
  if (req.url?.startsWith('/or/')) {
    assert.equal(req.headers.authorization, 'Bearer sk-or-test-key')
    if (req.url === '/or/models')
      return reply({
        data: [
          {
            id: 'openai/gpt-paid',
            pricing: { prompt: '0.00001', completion: '0.00003' },
            context_length: 128000,
          },
          {
            id: 'meta-llama/llama-3.3-70b-instruct:free',
            pricing: { prompt: '0', completion: '0' },
            context_length: 65536,
          },
          {
            id: 'deepseek/deepseek-chat-v3-0324:free',
            pricing: { prompt: '0', completion: '0' },
            context_length: 163840,
          },
        ],
      })
    fake.or = [...(fake.or ?? []), body.model]
    if (fake.orDown)
      return reply(
        { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } },
        429,
      )
    // Модерация и агент «Свой сюжет»: ответ зависит от роли в системном сообщении.
    const sys = body.messages?.[0]?.content ?? ''
    const said = body.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' ')
    const json = (data) => reply({ choices: [{ message: { content: JSON.stringify(data) } }] })
    if (sys.includes('модератор')) {
      fake.moderated = [...(fake.moderated ?? []), said]
      return json({ allowed: !said.includes('ножом'), category: 'violence', reason: 'угроза' })
    }
    const shot = (i) => ({
      ru: `Кадр ${i + 1} у моря`,
      en: `Medium shot of the person walking along a sunny sea shore, white linen shirt, waves and soft golden light, frame ${i + 1}`,
    })
    if (sys.includes('арт-директор AI-фотостудии')) {
      if (said.includes('тест-вывод'))
        return json({
          action: 'plan',
          reply: 'ok',
          plan: {
            title: 'Плохо',
            summary: 'x',
            shots: [0, 1, 2, 3].map((i) => ({ ...shot(i), en: `${shot(i).en} nude` })),
          },
        })
      return json({
        action: 'plan',
        reply: 'Добавил золотой свет и прогулку вдоль воды.',
        plan: {
          title: said.includes('закат') ? 'Море на закате' : 'Утро у моря',
          summary: 'Лёгкая прогулка у моря в солнечный день.',
          shots: [0, 1, 2, 3].map(shot),
        },
      })
    }
    if (sys.includes('режиссёр'))
      return json({
        action: 'plan',
        reply: 'Сделал четыре сцены и подобрал музыку.',
        plan: {
          title: 'Полёт над городом',
          summary: 'Герой на крыше небоскрёба на рассвете.',
          shots: [0, 1, 2, 3].map((i) => ({
            ru: `Сцена ${i + 1}`,
            still: 'the person standing on a skyscraper rooftop at dawn, city below, warm light',
            motion: 'the camera slowly orbits around the person, wind moves the hair',
          })),
          music: [
            { ru: 'Эпичный оркестр', tags: 'epic orchestral, strings, drums, uplifting', bpm: 100 },
            { ru: 'Лёгкий электро-поп', tags: 'electro pop, synth, upbeat', bpm: 120 },
            { ru: 'Спокойный эмбиент', tags: 'ambient, piano, calm', bpm: 80 },
          ],
        },
      })
    if (sys.includes('автор песен')) {
      if (!said.includes('поп'))
        return json({
          action: 'ask',
          question: 'В каком жанре? Поп, рок, лирическая баллада или рэп?',
        })
      return json({
        action: 'plan',
        reply: 'Вот текст и звучание.',
        plan: {
          title: 'Мама',
          summary: 'Тёплая поп-песня о маме.',
          genre: 'поп',
          tags: 'pop, warm, acoustic guitar, piano, heartfelt',
          bpm: 96,
          language: 'ru',
          vocal: 'female',
          lyrics: [
            '[Verse 1]',
            'Утро тёплое в окне',
            'Ты улыбаешься мне',
            'Пахнет кофе и весной',
            'Мама, ты всегда со мной',
            '[Chorus]',
            'Мама, мама, свет в окне',
            'Ты как солнце в тишине',
            'Мама, мама, дом родной',
            'Ты всегда-всегда со мной',
          ].join('\n'),
        },
      })
    }
    return reply({
      choices: [
        {
          message: {
            content:
              '```json\n' +
              JSON.stringify({
                title: 'Золотой час ✨',
                body: 'Тёплый свет и **кадры как из журнала**.',
                cta: '📸 Создай такую же фотосессию со своим лицом — жми на кнопку ниже↓',
                look: 'cream knitted sweater, loose waves, delicate gold earrings',
              }) +
              '\n```',
          },
        },
      ],
    })
  }
  // Локальная языковая модель (Ollama) для текстов агента.
  if (req.url === '/ollama/api/chat') {
    fake.llm = body
    return reply({
      message: {
        content: JSON.stringify({
          title: 'Утро в цветах 🌸',
          body: 'Нежный свет и **букет пионов в руках** — <b>кадры</b> как из журнала. #тег',
          cta: '📸 Хочешь такую же фотосессию со своим лицом? Жми на кнопку ниже↓',
        }),
      },
    })
  }
  // Загрузка файлов MAX: адрес загрузки → файл → токен.
  if (req.url?.startsWith('/max/uploads?type=')) {
    const kind = new URL(req.url, 'http://x').searchParams.get('type')
    return reply({
      url: `http://127.0.0.1:${fakePort}/max-upload/${kind}`,
      ...(kind === 'video' ? { token: 'vid-token' } : {}),
    })
  }
  if (req.url?.startsWith('/max-upload/')) {
    assert.equal(req.headers.authorization, 'max-test-token')
    const file = parts.get('data')
    fake.maxUploads.push({ url: req.url, size: file.size })
    return req.url.endsWith('/video')
      ? reply(1)
      : reply({ photos: { p1: { token: `img-${fake.maxUploads.length}` } } })
  }
  if (req.url === '/max/chats/-7001')
    return reply({
      chat_id: -7001,
      type: 'channel',
      title: 'Канал MAX',
      link: 'https://max.ru/se13448473_biz',
    })
  if (req.url === '/max/chats/-7001/members/me')
    return reply({ is_admin: true, permissions: ['write', 'read_all_messages'] })
  if (req.url?.startsWith('/max/messages?chat_id=') && fake.maxNotReady > 0) {
    fake.maxNotReady -= 1
    return reply(
      {
        code: 'attachment.not.ready',
        message: 'Key: errors.process.attachment.file.not.processed',
      },
      400,
    )
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
env.TELEGRAM_API_URL = `http://127.0.0.1:${fakePort}/tg`
env.TELEGRAM_PROXY = ''
env.OLLAMA_URL = `http://127.0.0.1:${fakePort}/ollama`
env.OPENROUTER_URL = `http://127.0.0.1:${fakePort}/or`
env.OPENROUTER_PROXY = ''
env.AUTOPOST_TEST_IMAGE = fileURLToPath(
  new URL('../../src/assets/playground/portrait-day.jpg', import.meta.url),
)

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

test('публикации в каналы: только админ, проверка ограничений, галерея в Telegram и MAX', async () => {
  const { call } = await newUser()
  assert.equal((await call('/api/admin/channels')).status, 403)
  const adm = await admin()
  // Токены ботов заданы в предыдущих тестах (Telegram и MAX).
  const tg = await adm('/api/admin/channels', {
    method: 'POST',
    json: { platform: 'telegram', ref: 'https://t.me/neeklo_ai' },
  })
  assert.equal(tg.status, 201, JSON.stringify(tg.data))
  assert.deepEqual(tg.data.channel, {
    id: 'telegram:-100500',
    platform: 'telegram',
    chatId: '-100500',
    title: 'Studio',
    username: 'neeklo_ai',
    canPost: true,
  })
  assert.equal(
    (
      await adm('/api/admin/channels', {
        method: 'POST',
        json: { platform: 'telegram', ref: 'nope' },
      })
    ).status,
    400,
  )

  // Канал MAX приходит событием bot_added на вебхук бота.
  const secret = createHash('sha256')
    .update('creator-webhook:max-test-token')
    .digest('hex')
    .slice(0, 48)
  await fetch(`${base}/api/bots/max/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-max-bot-api-secret': secret },
    body: JSON.stringify({
      update_type: 'bot_added',
      chat_id: -7001,
      user: { user_id: 1 },
      is_channel: true,
    }),
  })
  await new Promise((r) => setTimeout(r, 300))
  const list = await adm('/api/admin/channels')
  assert.deepEqual(
    list.data.channels.map((c) => [c.id, c.title, c.canPost]),
    [
      ['telegram:-100500', 'Studio', true],
      ['max:-7001', 'Канал MAX', true],
    ],
  )
  assert.equal(list.data.limits.telegram.caption, 1024)

  const video = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypmp42'),
    Buffer.alloc(64),
  ])
  const post = (fields, files = []) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) f.append(k, one)
    for (const [i, file] of files.entries())
      f.append(
        'files',
        new Blob([file.buf], { type: file.type }),
        `f${i}.${file.type === 'video/mp4' ? 'mp4' : 'jpg'}`,
      )
    return adm('/api/admin/posts', { method: 'POST', body: f })
  }
  const both = ['telegram:-100500', 'max:-7001']

  // Ограничения: пустой пост, длина текста MAX, лишние файлы, чужие файлы, плохая ссылка кнопки.
  assert.equal((await post({ channels: both, text: ' ' })).status, 400)
  const long = await post({ channels: both, text: 'а'.repeat(4001) })
  assert.equal(long.status, 400)
  assert.match(long.data.error, /Канал MAX: текст длиннее 4000/)
  // Тот же текст в Telegram проходит: там предел 4096.
  assert.equal((await post({ channels: ['telegram:-100500'], text: 'а'.repeat(4001) })).status, 201)
  const many = Array.from({ length: 11 }, () => ({ buf: photo, type: 'image/jpeg' }))
  assert.match((await post({ channels: both, text: 'x' }, many)).data.error, /Не больше 10/)
  assert.equal(
    (
      await post({ channels: both, text: 'x' }, [
        { buf: Buffer.from('<?php ?>'), type: 'image/jpeg' },
      ])
    ).status,
    415,
  )
  assert.equal(
    (
      await post({
        channels: both,
        text: 'x',
        buttonText: 'Открыть',
        buttonUrl: 'javascript:alert(1)',
      })
    ).status,
    400,
  )
  assert.equal((await post({ channels: [], text: 'x' })).status, 400)

  // Галерея: 2 фото + видео, подпись с разметкой и кнопка-ссылка.
  fake.tg.length = 0
  fake.max.length = 0
  fake.maxNotReady = 1
  const sent = await post(
    {
      channels: both,
      text: '**Новое** в студии <скоро>: [смотреть](https://creator.siteaccess.ru)',
      buttonText: 'Открыть студию',
      buttonUrl: 'https://creator.siteaccess.ru',
    },
    [
      { buf: photo, type: 'image/jpeg' },
      { buf: photo, type: 'image/jpeg' },
      { buf: video, type: 'video/mp4' },
    ],
  )
  assert.equal(sent.status, 201, JSON.stringify(sent.data))
  assert.equal(sent.data.status, 'sent', JSON.stringify(sent.data))

  const group = fake.tg.find((c) => c.method === 'sendMediaGroup')
  const media = JSON.parse(group.body.media)
  assert.deepEqual(
    media.map((m) => m.type),
    ['photo', 'photo', 'video'],
  )
  assert.equal(
    media[0].caption,
    '<b>Новое</b> в студии &lt;скоро&gt;: <a href="https://creator.siteaccess.ru">смотреть</a>',
  )
  assert.equal(group.files.length, 3)
  // Кнопку к альбому Telegram не прикрепить — она уходит следующим сообщением.
  const after = fake.tg.at(-1)
  assert.equal(after.method, 'sendMessage')
  assert.equal(
    JSON.parse(after.body.reply_markup).inline_keyboard[0][0].url,
    'https://creator.siteaccess.ru',
  )
  assert.match(sent.data.results[0].url, /^https:\/\/t\.me\/neeklo_ai\/\d+$/)

  assert.equal(fake.maxUploads.length, 3)
  const maxMsg = fake.max.at(-1)
  assert.match(maxMsg.url, /^\/max\/messages\?chat_id=-7001/)
  assert.equal(maxMsg.body.format, 'markdown')
  assert.deepEqual(
    maxMsg.body.attachments.map((a) => a.type),
    ['image', 'image', 'video', 'inline_keyboard'],
  )
  assert.equal(maxMsg.body.attachments[2].payload.token, 'vid-token')

  const history = await adm('/api/admin/posts')
  assert.equal(history.data.posts[0].status, 'sent')
  assert.equal(history.data.posts[0].media.length, 3)

  // Длинный текст с одним фото: фото без подписи, текст — отдельным сообщением.
  fake.tg.length = 0
  const longText = await post({ channels: ['telegram:-100500'], text: 'б'.repeat(2000) }, [
    { buf: photo, type: 'image/jpeg' },
  ])
  assert.equal(longText.data.status, 'sent')
  assert.deepEqual(
    fake.tg.map((c) => c.method),
    ['sendPhoto', 'sendMessage'],
  )
  assert.equal(fake.tg[0].body.caption, undefined)

  assert.equal(
    (await adm('/api/admin/channels/max:-7001', { method: 'DELETE' })).data.channels.length,
    1,
  )
})

test('агент публикаций: окно времени по Москве и следующий запуск', () => {
  // 07:30 UTC = 10:30 МСК
  const at = (utc) => new Date(`2026-11-18T${utc}:00Z`)
  assert.equal(inWindow('09:00', '21:00', at('07:30')), true)
  assert.equal(inWindow('09:00', '21:00', at('19:30')), false)
  assert.equal(inWindow('22:00', '02:00', at('20:30')), true)
  assert.equal(inWindow('22:00', '02:00', at('09:00')), false)
  const cfg = { intervalMin: 60, from: '09:00', to: '21:00' }
  const now = at('07:30').getTime()
  assert.equal(nextRunAt(cfg, now - 30 * 60_000, now), now + 30 * 60_000)
  // Ночью ждёт начала окна: 19:30 UTC (22:30 МСК) → 06:00 UTC (09:00 МСК).
  assert.equal(nextRunAt(cfg, 0, at('19:30').getTime()), new Date('2026-11-19T06:00:00Z').getTime())
})

test('агент публикаций: настройки, черновик с текстом модели, правка и публикация', async () => {
  const { call } = await newUser()
  assert.equal((await call('/api/admin/autopost')).status, 403)
  const adm = await admin()
  const initial = await adm('/api/admin/autopost')
  assert.equal(initial.data.settings.enabled, false)
  assert.equal(initial.data.settings.intervalMin, 60)

  assert.equal(
    (await adm('/api/admin/autopost', { method: 'PUT', json: { intervalMin: 5 } })).status,
    400,
  )
  assert.equal(
    (await adm('/api/admin/autopost', { method: 'PUT', json: { from: '25:00' } })).status,
    400,
  )
  assert.equal(
    (
      await adm('/api/admin/autopost', {
        method: 'PUT',
        json: { kinds: { photo: false, video: false } },
      })
    ).status,
    400,
  )
  const saved = await adm('/api/admin/autopost', {
    method: 'PUT',
    json: {
      enabled: true,
      intervalMin: 120,
      from: '10:00',
      to: '20:00',
      kinds: { photo: true, video: false },
    },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  assert.equal(saved.data.settings.intervalMin, 120)
  assert.ok(saved.data.nextAt)
  await adm('/api/admin/autopost', { method: 'PUT', json: { enabled: false } })

  const started = await adm('/api/admin/autopost/run', { method: 'POST', json: { publish: false } })
  assert.equal(started.status, 202, JSON.stringify(started.data))
  let item
  for (let i = 0; i < 50; i++) {
    item = (await adm('/api/admin/autopost')).data.items[0]
    if (item.status !== 'generating') break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(item.status, 'draft', JSON.stringify(item))
  assert.equal(item.kind, 'photo')
  assert.equal(item.media.length, 4)
  // Текст модели: без HTML и хэштегов, с жирным фрагментом и призывом.
  assert.equal(
    item.text,
    [
      'Утро в цветах 🌸',
      'Нежный свет и **букет пионов в руках** — bкадры/b как из журнала.',
      '📸 Хочешь такую же фотосессию со своим лицом? Жми на кнопку ниже↓',
    ].join('\n\n'),
  )
  assert.equal(fake.llm.think, false)
  assert.match(item.button.url, /^https:\/\/creator\.example\/photos\/[\w-]+$/)

  const patched = await adm(`/api/admin/autopost/${item.id}`, {
    method: 'PATCH',
    json: { text: 'Новый текст **поста**' },
  })
  assert.equal(patched.data.items[0].text, 'Новый текст **поста**')

  fake.tg.length = 0
  assert.equal(
    (await adm(`/api/admin/autopost/${item.id}/publish`, { method: 'POST' })).status,
    202,
  )
  for (let i = 0; i < 50; i++) {
    item = (await adm('/api/admin/autopost')).data.items[0]
    if (item.status !== 'publishing') break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(item.status, 'published', JSON.stringify(item))
  const group = fake.tg.find((c) => c.method === 'sendMediaGroup')
  assert.equal(JSON.parse(group.body.media).length, 4)
  assert.equal(JSON.parse(group.body.media)[0].caption, 'Новый текст <b>поста</b>')
  // Опубликованный пост не удаляется и не правится.
  assert.equal((await adm(`/api/admin/autopost/${item.id}`, { method: 'DELETE' })).status, 409)
})

test('агент публикаций: бесплатные модели OpenRouter, запасная модель на сервере', async () => {
  const adm = await admin()
  const saved = await adm('/api/admin/integrations', {
    method: 'PUT',
    json: { openrouter: { enabled: true, apiKey: 'sk-or-test-key' } },
  })
  assert.equal(saved.data.integrations.openrouter.apiKey.set, true)
  assert.ok(!JSON.stringify(saved.data).includes('sk-or-test-key'))

  const runDraft = async () => {
    await adm('/api/admin/autopost/run', { method: 'POST', json: { publish: false } })
    let item
    for (let i = 0; i < 80; i++) {
      item = (await adm('/api/admin/autopost')).data.items[0]
      if (item.status !== 'generating') break
      await new Promise((r) => setTimeout(r, 100))
    }
    return item
  }

  fake.or = []
  const viaOr = await runDraft()
  assert.equal(viaOr.status, 'draft', JSON.stringify(viaOr))
  // Только бесплатные модели, предпочтительная — первой.
  assert.deepEqual(fake.or, ['deepseek/deepseek-chat-v3-0324:free'])
  assert.equal(viaOr.model, 'openrouter:deepseek/deepseek-chat-v3-0324:free')
  assert.match(viaOr.text, /^Золотой час ✨\n\nТёплый свет/)

  // Лимит исчерпан на всех бесплатных моделях — текст пишет серверная модель.
  fake.or = []
  fake.orDown = true
  const fallback = await runDraft()
  fake.orDown = false
  assert.deepEqual(fake.or, [
    'deepseek/deepseek-chat-v3-0324:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ])
  assert.match(fallback.model, /^ollama:/)
  assert.match(fallback.text, /^Утро в цветах/)
})

test('бонус за подписку на канал: проверка через бота, один раз на аккаунт мессенджера', async () => {
  const guest = await client()('/api/rewards')
  assert.equal(guest.data.amount, 100)
  const ch = guest.data.channels.find((c) => c.id === 'telegram:-100500')
  assert.deepEqual(ch, {
    id: 'telegram:-100500',
    platform: 'telegram',
    title: 'Studio',
    url: 'https://t.me/neeklo_ai',
    claimed: false,
  })
  assert.equal(
    (await client()('/api/rewards/subscribe', { method: 'POST', json: { channelId: ch.id } }))
      .status,
    401,
  )

  // Без входа через Telegram подписку не проверить.
  const { call: emailUser } = await newUser()
  const noTg = await emailUser('/api/rewards/subscribe', {
    method: 'POST',
    json: { channelId: ch.id },
  })
  assert.equal(noTg.status, 400)
  assert.match(noTg.data.error, /войдите через Telegram/)

  // Вход из мини-приложения Telegram (подпись как у Telegram).
  const tgLogin = async (id) => {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id, first_name: 'Подписчик' }),
    })
    const check = [...params.entries()]
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const secret = createHmac('sha256', 'WebAppData').update('123456:SECRET-TOKEN-abcd').digest()
    params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
    const call = client()
    const res = await call('/api/auth/webapp', {
      method: 'POST',
      json: { platform: 'telegram', initData: params.toString() },
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    return call
  }
  const fan = await tgLogin(888)
  assert.equal((await fan('/api/rewards')).data.linked.telegram, true)
  const before = (await fan('/api/me')).data.user.balance

  fake.tgMember = 'left'
  const notYet = await fan('/api/rewards/subscribe', { method: 'POST', json: { channelId: ch.id } })
  assert.equal(notYet.status, 400)
  assert.match(notYet.data.error, /Подписка не найдена/)
  // Повторная проверка — не чаще раза в 5 секунд.
  assert.equal(
    (await fan('/api/rewards/subscribe', { method: 'POST', json: { channelId: ch.id } })).status,
    429,
  )

  await new Promise((r) => setTimeout(r, 5_100))
  fake.tgMember = 'member'
  const ok = await fan('/api/rewards/subscribe', { method: 'POST', json: { channelId: ch.id } })
  assert.equal(ok.status, 200, JSON.stringify(ok.data))
  assert.equal(ok.data.credited, 100)
  assert.equal(ok.data.channels.find((c) => c.id === ch.id).claimed, true)
  assert.equal((await fan('/api/me')).data.user.balance, before + 100)
  const history = (await fan('/api/wallet')).data.history
  assert.equal(history[0].reason, 'subscribe')

  await new Promise((r) => setTimeout(r, 5_100))
  assert.equal(
    (await fan('/api/rewards/subscribe', { method: 'POST', json: { channelId: ch.id } })).status,
    409,
  )
  fake.tgMember = undefined
})

test('свой сюжет: модерация, вопросы агента, согласование и задачи по сюжету', async () => {
  assert.equal(
    (await client()('/api/scenarios', { method: 'POST', json: { kind: 'photo', idea: 'море' } }))
      .status,
    401,
  )
  const { call } = await newUser()

  // Быстрый фильтр — без обращения к модели.
  fake.moderated = []
  const lewd = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'photo', idea: 'фото в нижнем белье на кровати' },
  })
  assert.equal(lewd.status, 422)
  assert.match(lewd.data.error, /откровенные/)
  assert.equal(fake.moderated.length, 0)
  // Проверка моделью.
  const threat = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'photo', idea: 'угрожаю прохожим ножом в переулке' },
  })
  assert.equal(threat.status, 422)
  assert.equal(fake.moderated.length, 1)

  // Фото: план → правка → согласование → задача.
  const photo = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'photo', idea: 'хочу прогулку у моря' },
  })
  assert.equal(photo.status, 201, JSON.stringify(photo.data))
  assert.equal(photo.data.status, 'proposed')
  assert.equal(photo.data.plan.shots.length, 4)
  assert.equal(photo.data.cost, 12) // цена фото изменена в тесте админки
  const revised = await call(`/api/scenarios/${photo.data.id}/reply`, {
    method: 'POST',
    json: { text: 'пусть будет закат' },
  })
  assert.equal(revised.data.plan.title, 'Море на закате')
  assert.deepEqual(
    revised.data.messages.map((m) => m.role),
    ['user', 'agent', 'user', 'agent'],
  )
  const target = `s-${photo.data.id}`
  // До согласования задачу не создать.
  assert.equal((await call('/api/jobs', { method: 'POST', body: form({ target }) })).status, 404)
  const approved = await call(`/api/scenarios/${photo.data.id}/approve`, {
    method: 'POST',
    json: {},
  })
  assert.equal(approved.data.status, 'approved')
  assert.equal(
    (await call(`/api/scenarios/${photo.data.id}/reply`, { method: 'POST', json: { text: 'ещё' } }))
      .status,
    409,
  )
  const other = await newUser()
  assert.equal(
    (await other.call('/api/jobs', { method: 'POST', body: form({ target }) })).status,
    404,
  )
  assert.equal((await other.call(`/api/scenarios/${photo.data.id}`)).status, 404)
  const job = await call('/api/jobs', { method: 'POST', body: form({ target }) })
  assert.equal(job.status, 201, JSON.stringify(job.data))
  await call(`/api/jobs/${job.data.id}/cancel`, { method: 'POST' })

  // Опасный план от модели не проходит.
  const bad = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'photo', idea: 'тест-вывод у моря' },
  })
  assert.equal(bad.data.plan, undefined)
  assert.match(bad.data.messages.at(-1).text, /нарушает правила/)

  // Видео: три варианта музыки, выбор согласуется.
  const video = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'video', idea: 'я на крыше небоскрёба' },
  })
  assert.equal(video.data.plan.music.length, 3)
  assert.equal(
    (await call(`/api/scenarios/${video.data.id}/approve`, { method: 'POST', json: { music: 7 } }))
      .status,
    400,
  )
  const withMusic = await call(`/api/scenarios/${video.data.id}/approve`, {
    method: 'POST',
    json: { music: 1 },
  })
  assert.equal(withMusic.data.music.tags, 'electro pop, synth, upbeat')

  // Песня: агент уточняет жанр, затем текст; задача без фото.
  const song = await call('/api/scenarios', {
    method: 'POST',
    json: { kind: 'song', idea: 'песня про маму' },
  })
  assert.equal(song.data.status, 'asking')
  assert.match(song.data.messages.at(-1).text, /жанре/)
  const lyrics = await call(`/api/scenarios/${song.data.id}/reply`, {
    method: 'POST',
    json: { text: 'поп, тёплая' },
  })
  assert.equal(lyrics.data.status, 'proposed')
  assert.match(lyrics.data.plan.lyrics, /\[Chorus\]/)
  assert.equal(lyrics.data.cost, 15)
  await call(`/api/scenarios/${song.data.id}/approve`, { method: 'POST', json: {} })
  const songForm = new FormData()
  songForm.append('kind', 'song')
  songForm.append('target', `s-${song.data.id}`)
  const songJob = await call('/api/jobs', { method: 'POST', body: songForm })
  assert.equal(songJob.status, 201, JSON.stringify(songJob.data))
  assert.equal(songJob.data.cost, 15)
  const view = await call(`/api/jobs/${songJob.data.id}`)
  assert.equal(view.data.kind, 'song')
  await call(`/api/jobs/${songJob.data.id}/cancel`, { method: 'POST' })
  // Песня без согласованного сюжета невозможна.
  const fakeSong = new FormData()
  fakeSong.append('kind', 'song')
  fakeSong.append('target', 'champagne-party')
  assert.equal((await call('/api/jobs', { method: 'POST', body: fakeSong })).status, 404)
})
