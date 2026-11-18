/** Общие HTTP-помощники API: ответы, JSON, cookie, проверка источника запроса. */

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

export function redirect(res, location, headers = {}) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...headers })
  res.end()
}

export async function readJson(req, limit = 64 * 1024) {
  const type = req.headers['content-type'] ?? ''
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Ожидается JSON')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос')
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not object')
    return body
  } catch {
    throw new HttpError(400, 'Неверный JSON')
  }
}

export function cookies(req) {
  const out = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export const SESSION_COOKIE = 'cs_session'

export function sessionCookie(token, { secure = true, maxAge = 30 * 86_400 } = {}) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

/**
 * Изменяющие запросы — только со своего сайта (и с localhost для разработки).
 * Вместе с SameSite=Lax это закрывает подделку запросов с чужих страниц.
 */
export function checkOrigin(req, publicOrigin) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) return
  const origin = req.headers.origin
  if (!origin) return
  if (origin === publicOrigin) return
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return
  throw new HttpError(403, 'Запрос с чужого сайта отклонён')
}

/** Только относительный путь внутри сайта: защита от открытого редиректа. */
export function safeReturn(path, fallback = '/cabinet') {
  return typeof path === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(path) ? path : fallback
}

/** Простое ограничение частоты по ключу (вход, регистрация). */
export function rateLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs })
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
      return
    }
    entry.count += 1
    if (entry.count > max)
      throw new HttpError(429, 'Слишком много попыток. Подождите несколько минут.')
  }
}
