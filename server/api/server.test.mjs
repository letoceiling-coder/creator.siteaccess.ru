/** Тесты API без GPU: npm run test:api */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

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

before(async () => {
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
  child.kill()
  await once(child, 'exit')
  rmSync(dir, { recursive: true, force: true })
})

/** Клиент с cookie сессии. */
function client() {
  let cookie = ''
  return async (path, { method = 'GET', json, body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
      redirect: 'manual',
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
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
