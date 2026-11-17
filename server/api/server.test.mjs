/** Тесты API без GPU: npm run test:api */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
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
let child

before(async () => {
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      MEDIA_DIR: dir,
      WORKER: 'off',
      MAX_DAILY: '3',
    },
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

function form(fields, files = [photo]) {
  const f = new FormData()
  for (const [k, v] of Object.entries({
    kind: 'photo',
    target: 'north',
    outfit: '0',
    time: 'day',
    consent: 'yes',
    ...fields,
  }))
    if (v !== undefined) f.append(k, v)
  for (const [i, file] of files.entries()) f.append('photos', new Blob([file]), `p${i}.jpg`)
  return f
}

const post = (body, headers = {}) => fetch(`${base}/api/jobs`, { method: 'POST', body, headers })

test('принимает задачу и отдаёт её по токену', async () => {
  const res = await post(form({}))
  assert.equal(res.status, 201)
  const { id, token, position } = await res.json()
  assert.match(id, /^[0-9a-f]{32}$/)
  assert.ok(position >= 1)

  const job = await (
    await fetch(`${base}/api/jobs/${id}`, { headers: { authorization: `Bearer ${token}` } })
  ).json()
  assert.equal(job.status, 'queued')
  assert.equal(job.total, 5)

  const wrong = await fetch(`${base}/api/jobs/${id}`, { headers: { authorization: 'Bearer nope' } })
  assert.equal(wrong.status, 404)

  const cancelled = await (
    await fetch(`${base}/api/jobs/${id}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
  ).json()
  assert.equal(cancelled.status, 'cancelled')
})

test('видеошаблон: три шага', async () => {
  const res = await post(form({ kind: 'video', target: 'coast-run' }))
  assert.equal(res.status, 201)
  const { id, token } = await res.json()
  const job = await (
    await fetch(`${base}/api/jobs/${id}`, { headers: { authorization: `Bearer ${token}` } })
  ).json()
  assert.equal(job.total, 3)
  await fetch(`${base}/api/jobs/${id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
})

test('отклоняет неверные запросы', async () => {
  assert.equal((await post(form({ consent: undefined }))).status, 400)
  assert.equal((await post(form({ target: 'unknown' }))).status, 404)
  assert.equal((await post(form({ target: '../etc' }))).status, 400)
  assert.equal((await post(form({ outfit: '9' }))).status, 400)
  assert.equal((await post(form({ time: 'constructor' }))).status, 400)
  assert.equal((await post(form({}, []))).status, 400)
  assert.equal((await post(form({}, [photo, photo, photo, photo]))).status, 400)
  // не картинка, хоть и с расширением .jpg
  assert.equal((await post(form({}, [Buffer.from('<?php echo 1; ?> just text here')]))).status, 415)
  assert.equal((await post('{}', { 'content-type': 'application/json' })).status, 415)
})

test('дневной лимит на клиента', async () => {
  // MAX_DAILY=3: две задачи уже созданы выше
  const a = await post(form({}))
  const tokenA = await a.json()
  const b = await post(form({}))
  assert.equal(b.status, 429)
  await fetch(`${base}/api/jobs/${tokenA.id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenA.token}` },
  })
})
