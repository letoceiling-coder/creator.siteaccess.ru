#!/usr/bin/env node
/**
 * API задач AI Creative Studio. Без внешних зависимостей: node:http, node:sqlite, ffmpeg.
 *
 * Задачи — только для вошедших пользователей, за токены (цены в админке).
 *   POST /api/jobs             multipart: kind (photo|video|animate), target, outfit, time,
 *                              duration (animate: 5|10), consent=yes, photos (1–3, animate: 1)
 *   GET  /api/jobs             задачи пользователя
 *   GET  /api/jobs/:id         владелец или администратор
 *   POST /api/jobs/:id/cancel  владелец или администратор
 *   /api/auth/*, /api/me, /api/wallet, /api/tariffs — routes-auth.mjs
 *   /api/admin/*                                    — routes-admin.mjs
 *   GET  /api/health
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { openAccounts } from './accounts.mjs'
import { openDb } from './db.mjs'
import { checkOrigin, cookies, HttpError, send, SESSION_COOKIE } from './http.mjs'
import { paymentsModule } from './payments.mjs'
import { adminRoutes } from './routes-admin.mjs'
import { authRoutes } from './routes-auth.mjs'
import { imageHasFace } from '../factory/faces.mjs'
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
  keepResultsMs: 7 * 24 * 3_600_000,
  publicUrl: env.PUBLIC_URL ?? 'https://creator.siteaccess.ru',
  insecureCookies: env.INSECURE_COOKIES === '1',
  loginLimit: Number(env.LOGIN_LIMIT ?? 10),
  registerLimit: Number(env.REGISTER_LIMIT ?? 5),
}
config.uploadDir = join(config.dataDir, 'uploads')

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`)
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

mkdirSync(config.uploadDir, { recursive: true })
const saltPath = join(config.dataDir, 'salt')
if (!existsSync(saltPath)) writeFileSync(saltPath, randomBytes(32).toString('hex'), { mode: 0o600 })
const salt = readFileSync(saltPath, 'utf8')

const { db, q } = openDb(join(config.dataDir, 'jobs.sqlite'))
const accounts = openAccounts(db)
// Запросы к новым столбцам jobs (user_id, cost) — после миграции в openAccounts.
q.owner = db.prepare('UPDATE jobs SET user_id = ?, cost = ? WHERE id = ?')
q.listFor = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
// Задача закончилась: при ошибке или отмене токены возвращаются, успех — награда пригласившему.
function onFinish(job, status) {
  if (status === 'done') accounts.rewardReferrer(job.user_id)
  else if (status === 'failed' || status === 'cancelled') accounts.refundJob(q.get.get(job.id))
}
// WORKER=off — только API, без GPU (для тестов).
const worker =
  env.WORKER === 'off'
    ? { cleanupInputs: () => {}, isBusy: () => false, stop: () => {} }
    : startWorker({ q, config, log, onFinish })

/** Клиент — хэш IP с солью: сам адрес не хранится. X-Real-IP верим только от локального nginx. */
function ipOf(req) {
  const socketIp = req.socket.remoteAddress ?? ''
  const local = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1'
  const ip = (local && req.headers['x-real-ip']) || socketIp
  return sha256(`${salt}:${ip}`)
}

const payments = paymentsModule({ db, accounts, config, log })
const handleAuth = authRoutes({ accounts, config, log, ipOf, payments })
const handleAdmin = adminRoutes({ accounts, db, q, log, payments })

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
    cost: job.cost ?? 0,
    refunded: Boolean(job.refunded),
    createdAt: job.created_at,
    finishedAt: job.finished_at ?? undefined,
  }
}

/** Задача видна владельцу и администратору; чужим — как будто её нет. */
function ownJob(user, id) {
  const job = q.get.get(id)
  if (!job || !user || (job.user_id !== user.id && user.role !== 'admin'))
    throw new HttpError(404, 'Задача не найдена')
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

async function createJob(req, res, sessionUser) {
  if (!sessionUser) throw new HttpError(401, 'Войдите, чтобы создавать фотосессии и видео')
  const user = accounts.ensureDaily(sessionUser)
  if (q.queued.get().n >= config.maxQueue)
    throw new HttpError(503, 'Очередь заполнена. Попробуйте через несколько минут.')
  if (q.activeFor.get(user.id).n >= config.maxActivePerClient)
    throw new HttpError(429, 'Уже идут две задачи. Дождитесь их завершения.')

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
  const duration = Number(text('duration', '5'))
  if (!['photo', 'video', 'animate'].includes(kind) || !/^[a-z0-9-]{1,40}$/.test(target))
    throw new HttpError(400, 'Неверный сценарий')
  if (!Number.isInteger(outfit) || outfit < 0 || outfit > 2 || !Object.hasOwn(times, time))
    throw new HttpError(400, 'Неверные параметры образа')
  if (![5, 10].includes(duration)) throw new HttpError(400, 'Длительность: 5 или 10 секунд')
  const options = kind === 'animate' ? { duration } : { outfit, time }
  // Пропорции для «оживления» станут известны после проверки фото; для плана берём заглушку.
  const plan = planFor(kind, target, { ...options, w: 3, h: 4 })
  if (!plan) throw new HttpError(404, 'Сценарий не найден')
  const cost = accounts.costFor(kind, options)
  if (user.balance < cost)
    throw new HttpError(
      402,
      `Недостаточно токенов: нужно ${cost}, на балансе ${user.balance}. Пополните баланс или пригласите друга.`,
    )

  const files = form.getAll('photos').filter((f) => typeof f === 'object' && f !== null)
  // Для сюжета на двоих — ровно два фото: первое — первый человек, второе — второй.
  const pair = kind === 'video' && plan.people === 2
  const minFiles = pair ? 2 : 1
  const maxFiles = kind === 'animate' ? 1 : pair ? 2 : 3
  if (files.length < minFiles || files.length > maxFiles)
    throw new HttpError(
      400,
      kind === 'animate'
        ? 'Нужно одно фото'
        : pair
          ? 'Нужно два фото: по одному на каждого человека'
          : 'Нужно от одного до трёх фото',
    )

  const id = randomBytes(16).toString('hex')
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
      if (i === 0) Object.assign(options, { w: size.width, h: size.height })
      // Для фотосессии и видео нужно различимое лицо на каждом снимке.
      if (kind !== 'animate' && env.FACE_CHECK !== 'off') {
        let face = { ok: true }
        try {
          face = await imageHasFace(readFileSync(join(dir, `${i}.png`)))
        } catch (error) {
          log(`проверка лица недоступна: ${error.message}`)
        }
        if (!face.ok)
          throw new HttpError(
            422,
            `На фото ${i + 1} не видно лица целиком. Выберите снимок, где лицо хорошо видно и не закрыто.`,
          )
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

  // Списание — после всех проверок фото; неудача или отмена вернут токены.
  if (cost > 0 && !accounts.change(user.id, -cost, 'job', titleOf(kind, target), id)) {
    rmSync(dir, { recursive: true, force: true })
    throw new HttpError(402, 'Недостаточно токенов')
  }
  const created = Date.now()
  q.insert.run(
    id,
    '-',
    kind,
    target,
    JSON.stringify(options),
    files.length,
    stepsFor(kind, plan),
    user.id,
    created,
  )
  q.owner.run(user.id, cost, id)
  log(`задача ${id.slice(0, 8)} принята: ${kind}/${target}, фото ${files.length}, ${cost} ток.`)
  send(res, 201, { id, position: positionOf(q.get.get(id)), cost })
}

function titleOf(kind, target) {
  if (kind === 'animate') return 'Оживление фото'
  return kind === 'video' ? `Видео: ${target}` : `Фотосессия: ${target}`
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://local')
  const path = url.pathname
  if (req.method === 'GET' && path === '/api/health') {
    return send(res, 200, { ok: true, queued: q.queued.get().n, busy: worker.isBusy() })
  }
  checkOrigin(req, new URL(config.publicUrl).origin)
  const user = accounts.userBySession(cookies(req)[SESSION_COOKIE])

  if (path.startsWith('/api/admin/')) return handleAdmin(req, res, path, user)
  if ((await handleAuth(req, res, path, url, user)) !== undefined || res.headersSent) return
  if (path.startsWith('/api/payments')) {
    await payments.handle(req, res, path, user)
    if (res.headersSent) return
  }

  if (req.method === 'POST' && path === '/api/jobs') return createJob(req, res, user)
  if (req.method === 'GET' && path === '/api/jobs') {
    if (!user) throw new HttpError(401, 'Войдите в аккаунт')
    return send(res, 200, { jobs: q.listFor.all(user.id).map(view) })
  }
  const match = /^\/api\/jobs\/([0-9a-f]{32})(\/cancel)?$/.exec(path)
  if (match) {
    const [, id, cancel] = match
    const job = ownJob(user, id)
    if (!cancel && req.method === 'GET') return send(res, 200, view(job))
    if (cancel && req.method === 'POST') {
      if (job.status === 'queued') {
        if (q.cancel.run(Date.now(), id).changes === 1) {
          worker.cleanupInputs(id)
          accounts.refundJob(q.get.get(id))
        }
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
