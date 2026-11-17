#!/usr/bin/env node
/**
 * API задач AI Creative Studio. Без внешних зависимостей: node:http, node:sqlite, ffmpeg.
 *
 *   POST /api/jobs             multipart: kind, target, outfit, time, consent=yes, photos (1–3)
 *   GET  /api/jobs/:id         Authorization: Bearer <token>
 *   POST /api/jobs/:id/cancel  Authorization: Bearer <token>
 *   GET  /api/health
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { openDb } from './db.mjs'
import { MAX_PHOTO_BYTES, normalize, sniff } from './images.mjs'
import { planFor, stepsFor, times } from './presets.mjs'
import { startWorker } from './worker.mjs'

const env = process.env
export const config = {
  host: env.HOST ?? '127.0.0.1',
  port: Number(env.PORT ?? 3480),
  dataDir: env.DATA_DIR ?? '/var/lib/creator-studio',
  mediaDir: env.MEDIA_DIR ?? '/var/www/creator-media',
  comfyData: env.COMFY_DATA ?? '/srv/comfyui/data/ComfyUI',
  maxBody: 48 * 1024 * 1024,
  maxQueue: Number(env.MAX_QUEUE ?? 30),
  maxActivePerClient: Number(env.MAX_ACTIVE ?? 2),
  maxDailyPerClient: Number(env.MAX_DAILY ?? 10),
  keepResultsMs: 7 * 24 * 3_600_000,
}
config.uploadDir = join(config.dataDir, 'uploads')

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`)
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

mkdirSync(config.uploadDir, { recursive: true })
const saltPath = join(config.dataDir, 'salt')
if (!existsSync(saltPath)) writeFileSync(saltPath, randomBytes(32).toString('hex'), { mode: 0o600 })
const salt = readFileSync(saltPath, 'utf8')

const { q } = openDb(join(config.dataDir, 'jobs.sqlite'))
// WORKER=off — только API, без GPU (для тестов).
const worker =
  env.WORKER === 'off'
    ? { cleanupInputs: () => {}, isBusy: () => false, stop: () => {} }
    : startWorker({ q, config, log })

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/** Клиент — хэш IP с солью: сам адрес не хранится. X-Real-IP верим только от локального nginx. */
function clientOf(req) {
  const socketIp = req.socket.remoteAddress ?? ''
  const local = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1'
  const ip = (local && req.headers['x-real-ip']) || socketIp
  return sha256(`${salt}:${ip}`)
}

function positionOf(job) {
  if (job.status !== 'queued') return 0
  return q.position.get(job.created_at).n + q.running.get().n + 1
}

function view(job) {
  return {
    id: job.id,
    kind: job.kind,
    target: job.target,
    status: job.status,
    done: job.done,
    total: job.total,
    position: positionOf(job),
    results: JSON.parse(job.results),
    error: job.error ?? undefined,
    createdAt: job.created_at,
    finishedAt: job.finished_at ?? undefined,
  }
}

function authorized(req, id) {
  const job = q.get.get(id)
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!job || !token) throw new HttpError(404, 'Задача не найдена')
  const a = Buffer.from(job.token_hash, 'hex')
  const b = Buffer.from(sha256(token), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(404, 'Задача не найдена')
  return job
}

/** Тело запроса с жёстким лимитом размера, разобранное как multipart. */
async function readForm(req) {
  const type = req.headers['content-type'] ?? ''
  if (!type.startsWith('multipart/form-data'))
    throw new HttpError(415, 'Ожидается multipart/form-data')
  const length = Number(req.headers['content-length'] ?? 0)
  if (length > config.maxBody) throw new HttpError(413, 'Фото слишком большие: до 15 МБ каждое')
  let seen = 0
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length
      if (seen > config.maxBody) cb(new HttpError(413, 'Фото слишком большие: до 15 МБ каждое'))
      else cb(null, chunk)
    },
  })
  const body = Readable.toWeb(req.pipe(limiter))
  const request = new Request('http://local/', {
    method: 'POST',
    headers: { 'content-type': type },
    body,
    duplex: 'half',
  })
  try {
    return await request.formData()
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Не удалось прочитать запрос')
  }
}

async function createJob(req, res) {
  const client = clientOf(req)
  if (q.queued.get().n >= config.maxQueue)
    throw new HttpError(503, 'Очередь заполнена. Попробуйте через несколько минут.')
  if (q.activeFor.get(client).n >= config.maxActivePerClient)
    throw new HttpError(429, 'Уже идут две задачи. Дождитесь их завершения.')
  if (q.dayFor.get(client, Date.now() - 86_400_000).n >= config.maxDailyPerClient)
    throw new HttpError(429, 'Дневной лимит задач исчерпан. Попробуйте завтра.')

  const form = await readForm(req)
  // Текстовые поля: файл на месте строки считаем пустым значением.
  const text = (name, fallback) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : fallback
  }
  const kind = text('kind', '')
  const target = text('target', '')
  const outfit = Number(text('outfit', '0'))
  const time = text('time', 'day')
  if (text('consent', '') !== 'yes') throw new HttpError(400, 'Нужно согласие на обработку фото')
  if (!['photo', 'video'].includes(kind) || !/^[a-z0-9-]{1,40}$/.test(target))
    throw new HttpError(400, 'Неверный сценарий')
  if (!Number.isInteger(outfit) || outfit < 0 || outfit > 2 || !Object.hasOwn(times, time))
    throw new HttpError(400, 'Неверные параметры образа')
  const options = { outfit, time }
  const plan = planFor(kind, target, options)
  if (!plan) throw new HttpError(404, 'Сценарий не найден')

  const files = form.getAll('photos').filter((f) => typeof f === 'object' && f !== null)
  if (files.length < 1 || files.length > 3) throw new HttpError(400, 'Нужно от одного до трёх фото')

  const id = randomBytes(16).toString('hex')
  const token = randomBytes(24).toString('base64url')
  const dir = join(config.uploadDir, id)
  mkdirSync(dir, { recursive: true })
  try {
    for (const [i, file] of files.entries()) {
      if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, 'Каждое фото — до 15 МБ')
      const buf = Buffer.from(await file.arrayBuffer())
      const format = sniff(buf)
      if (!format) throw new HttpError(415, 'Подходят только JPEG, PNG и WebP')
      const raw = join(dir, `${i}.src`)
      writeFileSync(raw, buf)
      let size
      try {
        size = await normalize(raw, join(dir, `${i}.png`))
      } catch {
        throw new HttpError(422, `Фото ${i + 1} повреждено или не читается`)
      } finally {
        rmSync(raw, { force: true })
      }
      if (Math.min(size.width, size.height) < 256)
        throw new HttpError(
          422,
          `Фото ${i + 1} слишком маленькое: нужно от 256 px по короткой стороне`,
        )
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }

  const created = Date.now()
  q.insert.run(
    id,
    sha256(token),
    kind,
    target,
    JSON.stringify(options),
    files.length,
    stepsFor(kind, plan),
    client,
    created,
  )
  log(`задача ${id.slice(0, 8)} принята: ${kind}/${target}, фото ${files.length}`)
  send(res, 201, { id, token, position: positionOf(q.get.get(id)) })
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://local')
  const path = url.pathname
  if (req.method === 'GET' && path === '/api/health') {
    return send(res, 200, { ok: true, queued: q.queued.get().n, busy: worker.isBusy() })
  }
  if (req.method === 'POST' && path === '/api/jobs') return createJob(req, res)
  const match = /^\/api\/jobs\/([0-9a-f]{32})(\/cancel)?$/.exec(path)
  if (match) {
    const [, id, cancel] = match
    const job = authorized(req, id)
    if (!cancel && req.method === 'GET') return send(res, 200, view(job))
    if (cancel && req.method === 'POST') {
      if (job.status === 'queued') {
        q.cancel.run(Date.now(), id)
        worker.cleanupInputs(id)
      } else if (job.status === 'running') {
        q.requestCancel.run(id)
      }
      return send(res, 200, view(q.get.get(id)))
    }
  }
  throw new HttpError(404, 'Не найдено')
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) log(`ошибка: ${error.stack ?? error}`)
    if (!res.headersSent)
      send(res, status, { error: status === 500 ? 'Внутренняя ошибка' : error.message })
    // Недочитанное тело (например, при превышении лимита) не держим.
    req.resume()
  })
})
server.requestTimeout = 120_000
server.listen(config.port, config.host, () => log(`API слушает ${config.host}:${config.port}`))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('остановка')
    worker.stop()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  })
}
