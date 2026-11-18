/**
 * Быстрый вход: Яндекс (OAuth 2.0), VK ID (OAuth 2.1 + PKCE), Telegram (вход на сайте и
 * мини-приложение) и MAX (мини-приложение). Ключи задаются в админке, раздел «Интеграции».
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const b64url = (buf) => buf.toString('base64url')

export function pkce() {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function safeEqualHex(a, b) {
  const x = Buffer.from(a ?? '', 'hex')
  const y = Buffer.from(b ?? '', 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

async function json(res, what) {
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${what}: неожиданный ответ (${res.status})`)
  }
  if (!res.ok || body.error)
    throw new Error(`${what}: ${body.error_description ?? body.error ?? res.status}`)
  return body
}

/* ── Яндекс ── */

export function yandexAuthorizeUrl(cfg, redirectUri, state) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
    force_confirm: 'no',
  })
  return `https://oauth.yandex.ru/authorize?${q}`
}

export async function yandexProfile(cfg, code) {
  const token = await json(
    await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    }),
    'Яндекс, токен',
  )
  const info = await json(
    await fetch('https://login.yandex.ru/info?format=json', {
      headers: { authorization: `OAuth ${token.access_token}` },
    }),
    'Яндекс, профиль',
  )
  return {
    id: info.id,
    name: info.display_name || info.real_name || info.login || 'Пользователь Яндекса',
    email: info.default_email || undefined,
    emailVerified: Boolean(info.default_email),
    avatar:
      info.default_avatar_id && !info.is_avatar_empty
        ? `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
        : undefined,
  }
}

/* ── VK ID ── */

export function vkAuthorizeUrl(cfg, redirectUri, state, challenge) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'email',
  })
  return `https://id.vk.com/authorize?${q}`
}

export async function vkProfile(cfg, { code, deviceId, state, verifier, redirectUri }) {
  const token = await json(
    await fetch('https://id.vk.com/oauth2/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: cfg.clientId,
        device_id: deviceId,
        redirect_uri: redirectUri,
        state,
      }),
    }),
    'VK ID, токен',
  )
  const info = await json(
    await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, access_token: token.access_token }),
    }),
    'VK ID, профиль',
  )
  const user = info.user ?? {}
  return {
    id: user.user_id ?? token.user_id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь VK',
    email: user.email || undefined,
    emailVerified: Boolean(user.email),
    avatar: user.avatar || undefined,
  }
}

/* ── Telegram: вход на сайте ── */

/** Номер бота — часть токена до двоеточия; нужен для страницы входа oauth.telegram.org. */
export const telegramBotId = (token) => (token ?? '').split(':')[0]

export function telegramAuthorizeUrl(cfg, origin, returnTo) {
  const q = new URLSearchParams({
    bot_id: telegramBotId(cfg.botToken),
    origin,
    request_access: 'write',
    return_to: returnTo,
  })
  return `https://oauth.telegram.org/auth?${q}`
}

/** Проверка данных виджета входа: HMAC-SHA256 ключом SHA256(токена бота), не старше суток. */
export function verifyTelegramLogin(cfg, data) {
  if (!cfg.botToken || !data || typeof data !== 'object') return undefined
  const { hash, ...rest } = data
  const check = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n')
  const secret = createHash('sha256').update(cfg.botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest('hex')
  if (!safeEqualHex(expected, String(hash))) return undefined
  if (Date.now() / 1000 - Number(rest.auth_date) > 86_400) return undefined
  return {
    id: rest.id,
    name:
      [rest.first_name, rest.last_name].filter(Boolean).join(' ') ||
      rest.username ||
      'Пользователь Telegram',
    avatar: rest.photo_url,
  }
}

/* ── Мини-приложения Telegram и MAX: initData ── */

/**
 * Проверка initData мини-приложения: секрет = HMAC-SHA256("WebAppData", токен бота),
 * подпись — HMAC-SHA256(секрет, отсортированные пары key=value без hash). Не старше суток.
 * Telegram описывает этот алгоритм в документации Mini Apps; MAX использует ту же схему.
 */
export function verifyWebAppInitData(botToken, initData) {
  if (!botToken || typeof initData !== 'string' || initData.length > 8192) return undefined
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const sign = (p) =>
    createHmac('sha256', secret)
      .update(
        [...p.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      )
      .digest('hex')
  // Поле signature (Ed25519) в одних клиентах входит в строку проверки, в других — нет.
  const withoutSignature = new URLSearchParams(params)
  withoutSignature.delete('signature')
  const valid =
    safeEqualHex(sign(params), hash ?? '') || safeEqualHex(sign(withoutSignature), hash ?? '')
  if (!valid) return undefined
  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > 86_400) return undefined
  let user
  try {
    user = JSON.parse(params.get('user') ?? '{}')
  } catch {
    return undefined
  }
  if (!user?.id) return undefined
  return {
    id: user.id,
    name:
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.username ||
      'Пользователь',
    avatar: user.photo_url,
    startParam: params.get('start_param') ?? undefined,
  }
}
