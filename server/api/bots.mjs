/**
 * Боты Telegram и MAX: настройка (вебхук, кнопка мини-приложения), ответы на /start и
 * вход на сайте через бота — пользователь подтверждает вход кнопкой в мессенджере.
 *
 * Telegram API недоступен с сервера напрямую: запросы идут через HTTP-прокси TELEGRAM_PROXY
 * (на сервере — tor, 127.0.0.1:8118). Входящие вебхуки Telegram доходят напрямую.
 * MAX: заголовок Authorization с токеном; адрес API — MAX_API_URL.
 */
import { execFile } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies, HttpError, readJson, send, sessionCookie } from './http.mjs'

const TELEGRAM_API = process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org'
const TELEGRAM_PROXY = process.env.TELEGRAM_PROXY ?? ''
const MAX_API = process.env.MAX_API_URL ?? 'https://platform-api.max.ru'
const LINK_TTL = 5 * 60_000
const LINK_COOKIE = 'cs_link'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const same = (a, b) => {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

export function botsModule({ db, accounts, config, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_links (
      code TEXT PRIMARY KEY,
      nonce_hash TEXT NOT NULL,
      platform TEXT NOT NULL,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0
    );
  `)
  const st = {
    insert: db.prepare(
      'INSERT INTO login_links (code, nonce_hash, platform, created_at) VALUES (?, ?, ?, ?)',
    ),
    get: db.prepare('SELECT * FROM login_links WHERE code = ?'),
    confirm: db.prepare(
      'UPDATE login_links SET user_id = ? WHERE code = ? AND user_id IS NULL AND consumed = 0 AND created_at > ?',
    ),
    consume: db.prepare('UPDATE login_links SET consumed = 1 WHERE code = ? AND consumed = 0'),
    gc: db.prepare('DELETE FROM login_links WHERE created_at < ?'),
  }

  const integrations = () => accounts.getSetting('integrations')
  /** Секрет вебхука выводится из токена бота: при смене токена меняется и он. */
  const webhookSecret = (token) => sha(`creator-webhook:${token}`).slice(0, 48)

  /** Кнопка «Войти через бота» появляется только после успешной настройки вебхука. */
  function markWebhook(platform) {
    const cfg = integrations()
    cfg[platform].webhookFor = sha(cfg[platform].botToken).slice(0, 16)
    accounts.setSetting('integrations', cfg)
  }

  /* ── Telegram ── */

  async function tg(method, body = {}) {
    const token = integrations().telegram.botToken
    if (!token) throw new Error('Не задан токен бота Telegram')
    const url = `${TELEGRAM_API}/bot${token}/${method}`
    // Адрес с токеном передаётся curl через stdin, а не аргументом — его не видно в списке процессов.
    const args = [
      '-s',
      '-m',
      '25',
      '-K',
      '-',
      '-H',
      'content-type: application/json',
      '-d',
      JSON.stringify(body),
    ]
    if (TELEGRAM_PROXY) args.unshift('-x', TELEGRAM_PROXY)
    const child = execFile('curl', args, { maxBuffer: 2 * 1024 * 1024 })
    child.stdin.end(`url = "${url}"\n`)
    const stdout = await new Promise((resolve, reject) => {
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`curl ${code}`))))
    })
    const res = JSON.parse(stdout || '{}')
    if (!res.ok) throw new Error(`Telegram ${method}: ${res.description ?? 'ошибка'}`)
    return res.result
  }

  const tgWebApp = (path = '/telegram') => ({ url: `${config.publicUrl}${path}` })

  async function telegramSetup() {
    const token = integrations().telegram.botToken
    await tg('setWebhook', {
      url: `${config.publicUrl}/api/bots/telegram/webhook`,
      secret_token: webhookSecret(token),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
    await tg('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Студия', web_app: tgWebApp() },
    })
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть студию' }] })
    markWebhook('telegram')
    return telegramStatus()
  }

  async function telegramStatus() {
    const [me, hook, menu] = await Promise.all([
      tg('getMe'),
      tg('getWebhookInfo'),
      tg('getChatMenuButton'),
    ])
    return {
      username: me.username,
      webhook: hook.url || '',
      webhookOk: hook.url === `${config.publicUrl}/api/bots/telegram/webhook`,
      pending: hook.pending_update_count ?? 0,
      lastError: hook.last_error_message ?? undefined,
      menuButton: menu.type === 'web_app' ? menu.web_app?.url : menu.type,
      miniAppOk: menu.type === 'web_app' && menu.web_app?.url === tgWebApp().url,
    }
  }

  async function telegramUpdate(update) {
    const message = update.message
    if (message?.text?.startsWith('/start')) {
      const payload = message.text.split(' ')[1] ?? ''
      const chatId = message.chat.id
      if (payload.startsWith('login_')) return askConfirm('telegram', chatId, payload.slice(6))
      return tg('sendMessage', {
        chat_id: chatId,
        text: 'Привет! Здесь фотосессии и видео, где вы — главный герой. Откройте студию кнопкой ниже.',
        reply_markup: { inline_keyboard: [[{ text: 'Открыть студию', web_app: tgWebApp() }]] },
      })
    }
    const cb = update.callback_query
    if (cb?.data?.startsWith('confirm_login:')) {
      const ok = confirmLink(cb.data.slice(14), 'telegram', {
        id: cb.from.id,
        name: [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') || cb.from.username,
      })
      await tg('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: ok ? 'Вход подтверждён' : 'Ссылка устарела',
      })
      if (cb.message)
        await tg('editMessageText', {
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          text: ok
            ? '✅ Вход на сайте подтверждён. Вернитесь в браузер.'
            : 'Ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз.',
        })
    }
    return undefined
  }

  /* ── MAX ── */

  async function max(method, path, body) {
    const token = integrations().max.botToken
    if (!token) throw new Error('Не задан токен бота MAX')
    const res = await fetch(`${MAX_API}${path}`, {
      method,
      headers: { authorization: token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.success === false)
      throw new Error(`MAX ${path}: ${data.message ?? data.code ?? res.status}`)
    return data
  }

  const maxHook = () => `${config.publicUrl}/api/bots/max/webhook`

  async function maxStatus() {
    const me = await max('GET', '/me')
    const subs = (await max('GET', '/subscriptions')).subscriptions ?? []
    const cfg = integrations()
    if (me.username && cfg.max.botUsername !== me.username) {
      cfg.max.botUsername = me.username
      accounts.setSetting('integrations', cfg)
    }
    return {
      username: me.username,
      name: me.name,
      webhookOk: subs.some((s) => s.url === maxHook()),
      // Чужие адреса показываем только доменом — без путей и секретов в параметрах.
      otherSubscriptions: subs
        .filter((s) => s.url !== maxHook())
        .map((s) => {
          try {
            return new URL(s.url).host
          } catch {
            return 'неизвестный адрес'
          }
        }),
    }
  }

  async function maxSetup() {
    await max('POST', '/subscriptions', {
      url: maxHook(),
      update_types: ['bot_started', 'message_created', 'message_callback'],
      secret: webhookSecret(integrations().max.botToken),
    })
    markWebhook('max')
    return maxStatus()
  }

  const maxAppLink = () => {
    const u = integrations().max.botUsername
    return u ? `https://max.ru/${u}?startapp` : config.publicUrl + '/max'
  }

  async function maxSend(userId, text, buttons) {
    return max('POST', `/messages?user_id=${encodeURIComponent(userId)}`, {
      text,
      attachments: buttons ? [{ type: 'inline_keyboard', payload: { buttons } }] : undefined,
    })
  }

  async function maxUpdate(update) {
    if (update.update_type === 'bot_started') {
      const payload = update.payload ?? ''
      if (payload.startsWith('login_'))
        return askConfirm('max', update.user.user_id, payload.slice(6))
      return maxSend(
        update.user.user_id,
        'Привет! Здесь фотосессии и видео, где вы — главный герой.',
        [[{ type: 'link', text: 'Открыть студию', url: maxAppLink() }]],
      )
    }
    if (
      update.update_type === 'message_created' &&
      update.message?.body?.text?.startsWith('/start')
    ) {
      const userId = update.message.sender?.user_id
      if (userId)
        return maxSend(userId, 'Откройте студию кнопкой ниже.', [
          [{ type: 'link', text: 'Открыть студию', url: maxAppLink() }],
        ])
    }
    if (update.update_type === 'message_callback') {
      const cb = update.callback
      if (!cb?.payload?.startsWith('confirm_login:')) return undefined
      const ok = confirmLink(cb.payload.slice(14), 'max', {
        id: cb.user.user_id,
        name: cb.user.name || [cb.user.first_name, cb.user.last_name].filter(Boolean).join(' '),
      })
      return max('POST', `/answers?callback_id=${encodeURIComponent(cb.callback_id)}`, {
        message: {
          text: ok
            ? '✅ Вход на сайте подтверждён. Вернитесь в браузер.'
            : 'Ссылка для входа устарела. Нажмите «Войти через MAX» на сайте ещё раз.',
          attachments: [],
        },
      })
    }
    return undefined
  }

  /* ── Вход на сайте через бота ── */

  async function askConfirm(platform, chatId, code) {
    const link = st.get.get(code)
    const fresh = link && !link.user_id && !link.consumed && link.created_at > Date.now() - LINK_TTL
    const text = fresh
      ? 'Вход на сайт creator.siteaccess.ru. Если это вы только что нажали «Войти» на сайте — подтвердите. Если нет — ничего не нажимайте.'
      : 'Ссылка для входа устарела. Нажмите кнопку входа на сайте ещё раз.'
    if (platform === 'telegram') {
      return tg('sendMessage', {
        chat_id: chatId,
        text,
        reply_markup: fresh
          ? {
              inline_keyboard: [
                [{ text: '✅ Подтвердить вход', callback_data: `confirm_login:${code}` }],
              ],
            }
          : undefined,
      })
    }
    return maxSend(
      chatId,
      text,
      fresh
        ? [[{ type: 'callback', text: '✅ Подтвердить вход', payload: `confirm_login:${code}` }]]
        : undefined,
    )
  }

  function confirmLink(code, platform, profile) {
    const link = st.get.get(code)
    if (!link || link.platform !== platform) return false
    const user = accounts.userFromIdentity(
      platform,
      profile.id,
      { name: profile.name || 'Пользователь' },
      null,
    )
    return st.confirm.run(user.id, code, Date.now() - LINK_TTL).changes === 1
  }

  function botUsername(platform) {
    const cfg = integrations()
    return platform === 'telegram' ? cfg.telegram.botUsername : cfg.max.botUsername
  }

  function linkReady(platform) {
    const cfg = integrations()[platform]
    return Boolean(
      cfg?.enabled &&
      cfg.botToken &&
      botUsername(platform) &&
      cfg.webhookFor === sha(cfg.botToken).slice(0, 16),
    )
  }

  return {
    linkReady,
    async handle(req, res, path) {
      const method = req.method

      if (method === 'POST' && path === '/api/bots/telegram/webhook') {
        const token = integrations().telegram.botToken
        if (!token || !same(req.headers['x-telegram-bot-api-secret-token'], webhookSecret(token)))
          throw new HttpError(403, 'Неверный секрет вебхука')
        const update = await readJson(req, 256 * 1024)
        telegramUpdate(update).catch((e) => log(`Telegram: ${e.message}`))
        return send(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/api/bots/max/webhook') {
        const token = integrations().max.botToken
        if (!token || !same(req.headers['x-max-bot-api-secret'], webhookSecret(token)))
          throw new HttpError(403, 'Неверный секрет вебхука')
        const update = await readJson(req, 256 * 1024)
        maxUpdate(update).catch((e) => log(`MAX: ${e.message}`))
        return send(res, 200, { ok: true })
      }

      // Начало входа через бота: код для ссылки + метка браузера в cookie.
      if (method === 'POST' && path === '/api/auth/link/start') {
        const body = await readJson(req)
        const platform =
          body.platform === 'telegram' ? 'telegram' : body.platform === 'max' ? 'max' : ''
        if (!platform || !linkReady(platform))
          throw new HttpError(400, 'Этот способ входа выключен')
        st.gc.run(Date.now() - 24 * 3_600_000)
        const code = randomBytes(12).toString('hex')
        const nonce = randomBytes(24).toString('base64url')
        st.insert.run(code, sha(nonce), platform, Date.now())
        const bot = botUsername(platform)
        const url =
          platform === 'telegram'
            ? `https://t.me/${bot}?start=login_${code}`
            : `https://max.ru/${bot}?start=login_${code}`
        const cookie = `${LINK_COOKIE}=${nonce}; Path=/api/auth/link; HttpOnly; SameSite=Lax; Max-Age=600${config.insecureCookies ? '' : '; Secure'}`
        return send(res, 201, { code, url, expiresIn: LINK_TTL / 1000 }, { 'set-cookie': cookie })
      }

      // Браузер ждёт подтверждения; сессию получает только тот, кто начал вход (метка в cookie).
      const poll = /^\/api\/auth\/link\/([0-9a-f]{24})$/.exec(path)
      if (method === 'GET' && poll) {
        const link = st.get.get(poll[1])
        if (!link || !same(link.nonce_hash, sha(cookies(req)[LINK_COOKIE] ?? '')))
          throw new HttpError(404, 'Вход не найден')
        if (link.consumed) return send(res, 200, { status: 'used' })
        if (!link.user_id)
          return send(res, 200, {
            status: link.created_at < Date.now() - LINK_TTL ? 'expired' : 'pending',
          })
        if (st.consume.run(link.code).changes !== 1) return send(res, 200, { status: 'used' })
        const user = accounts.st.userById.get(link.user_id)
        if (!user || user.blocked) throw new HttpError(403, 'Аккаунт недоступен')
        const token = accounts.createSession(user.id)
        return send(
          res,
          200,
          { status: 'confirmed' },
          {
            'set-cookie': sessionCookie(token, { secure: !config.insecureCookies }),
          },
        )
      }

      return undefined
    },
    admin: {
      telegramStatus,
      telegramSetup,
      maxStatus,
      maxSetup,
    },
    // для тестов
    _confirm: confirmLink,
  }
}
