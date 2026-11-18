/**
 * Боты Telegram и MAX: настройка (вебхук, кнопка мини-приложения), ответы на /start и
 * вход на сайте через бота — пользователь подтверждает вход кнопкой в мессенджере.
 *
 * Telegram API недоступен с сервера напрямую: запросы идут через HTTP-прокси TELEGRAM_PROXY
 * (на сервере — http://31.207.5.233:8888). Входящие вебхуки Telegram доходят напрямую.
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

export function botsModule({ db, accounts, config, log, channels }) {
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
  for (const column of ['ref TEXT', 'link_user TEXT']) {
    try {
      db.exec(`ALTER TABLE login_links ADD COLUMN ${column}`)
    } catch {
      // колонка уже есть
    }
  }
  const st = {
    insert: db.prepare(
      'INSERT INTO login_links (code, nonce_hash, platform, created_at, ref, link_user) VALUES (?, ?, ?, ?, ?, ?)',
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

  async function tg(method, body = {}, timeoutSec = 25) {
    const token = integrations().telegram.botToken
    if (!token) throw new Error('Не задан токен бота Telegram')
    const url = `${TELEGRAM_API}/bot${token}/${method}`
    // Адрес с токеном передаётся curl через stdin, а не аргументом — его не видно в списке процессов.
    const args = [
      '-s',
      '-m',
      String(timeoutSec),
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

  /**
   * Приём сообщений Telegram. Хостинг в РФ: Telegram не достучится до вебхука, поэтому по
   * умолчанию сервер сам забирает обновления (getUpdates) через прокси. TELEGRAM_MODE=webhook —
   * если сервер доступен из Telegram.
   */
  const TELEGRAM_MODE = process.env.TELEGRAM_MODE ?? 'polling'
  const polling = { active: false, lastOk: 0, lastError: '', offset: 0, token: '' }

  async function pollLoop() {
    if (polling.active) return
    polling.active = true
    while (polling.active) {
      const cfg = integrations().telegram
      if (!cfg.enabled || !cfg.botToken || cfg.webhookFor !== sha(cfg.botToken).slice(0, 16)) {
        await new Promise((r) => setTimeout(r, 15_000))
        continue
      }
      if (polling.token !== cfg.botToken) {
        polling.token = cfg.botToken
        polling.offset = 0
      }
      try {
        const updates = await tg(
          'getUpdates',
          { offset: polling.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
          40,
        )
        polling.lastOk = Date.now()
        polling.lastError = ''
        for (const update of updates) {
          polling.offset = update.update_id + 1
          await telegramUpdate(update).catch((e) => log(`Telegram: ${e.message}`))
        }
      } catch (error) {
        polling.lastError = error.message
        log(`Telegram getUpdates: ${error.message}`)
        await new Promise((r) => setTimeout(r, 5_000))
      }
    }
  }

  async function telegramSetup() {
    const token = integrations().telegram.botToken
    if (TELEGRAM_MODE === 'webhook') {
      await tg('setWebhook', {
        url: `${config.publicUrl}/api/bots/telegram/webhook`,
        secret_token: webhookSecret(token),
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      })
    } else {
      // Вебхук мешает getUpdates — снимаем; накопившиеся сообщения не теряем.
      await tg('deleteWebhook', { drop_pending_updates: false })
    }
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
    const polled = TELEGRAM_MODE !== 'webhook'
    return {
      username: me.username,
      mode: polled ? 'polling' : 'webhook',
      webhook: hook.url || '',
      // «Приём сообщений работает»: вебхук указывает на студию или опрос через прокси отвечает.
      webhookOk: polled
        ? !hook.url && polling.active && Date.now() - polling.lastOk < 90_000
        : hook.url === `${config.publicUrl}/api/bots/telegram/webhook`,
      pending: hook.pending_update_count ?? 0,
      lastError: (polled ? polling.lastError : hook.last_error_message) || undefined,
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
      // /start ref_КОД — пришли по приглашению: код передаём в мини-приложение.
      const ref = /^ref_([\w-]{3,16})$/.exec(payload)?.[1]
      const app = tgWebApp()
      return tg('sendMessage', {
        chat_id: chatId,
        text: ref
          ? 'Привет! Вас пригласили в студию — при входе получите бонусные токены. Откройте студию кнопкой ниже.'
          : 'Привет! Здесь фотосессии и видео, где вы — главный герой. Откройте студию кнопкой ниже.',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Открыть студию', web_app: ref ? { url: `${app.url}?ref=${ref}` } : app }],
          ],
        },
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
        text: ok === 'taken' ? 'Аккаунт уже связан с другим' : ok ? 'Готово' : 'Ссылка устарела',
      })
      if (cb.message)
        await tg('editMessageText', {
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          text: replyFor(ok, 'Telegram'),
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
      // bot_added / bot_removed — так студия узнаёт ID каналов, куда добавили бота.
      update_types: [
        'bot_started',
        'message_created',
        'message_callback',
        'bot_added',
        'bot_removed',
      ],
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
    if (update.update_type === 'bot_added' || update.update_type === 'bot_removed')
      return channels?.onMaxUpdate(update)
    const recipient = update.message?.recipient
    if (
      update.update_type === 'message_created' &&
      recipient?.chat_type === 'channel' &&
      recipient.chat_id
    )
      return channels?.onMaxUpdate({ update_type: 'channel_post', chat_id: recipient.chat_id })
    if (update.update_type === 'bot_started') {
      const payload = update.payload ?? ''
      if (payload.startsWith('login_'))
        return askConfirm('max', update.user.user_id, payload.slice(6))
      const ref = /^ref_([\w-]{3,16})$/.exec(payload)?.[1]
      return maxSend(
        update.user.user_id,
        ref
          ? 'Привет! Вас пригласили в студию — при входе получите бонусные токены.'
          : 'Привет! Здесь фотосессии и видео, где вы — главный герой.',
        [
          [
            {
              type: 'link',
              text: 'Открыть студию',
              url: ref ? `${maxAppLink()}=ref_${ref}` : maxAppLink(),
            },
          ],
        ],
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
          text: replyFor(ok, 'MAX'),
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

  function replyFor(ok, name) {
    if (ok === 'taken')
      return `Этот аккаунт ${name} уже связан с другим пользователем студии. Войдите на сайте через ${name}, чтобы попасть в тот аккаунт.`
    if (ok === 'linked') return `✅ ${name} привязан к вашему аккаунту студии. Вернитесь в браузер.`
    return ok
      ? '✅ Вход на сайте подтверждён. Вернитесь в браузер.'
      : `Ссылка для входа устарела. Нажмите «Войти через ${name}» на сайте ещё раз.`
  }

  function confirmLink(code, platform, profile) {
    const link = st.get.get(code)
    if (!link || link.platform !== platform) return false
    // Привязка к уже вошедшему пользователю: тот же аккаунт на сайте получает мессенджер.
    if (link.link_user) {
      const result = accounts.linkIdentity(link.link_user, platform, profile.id)
      if (result !== 'linked') {
        st.confirm.run('taken', code, Date.now() - LINK_TTL)
        return 'taken'
      }
      log(`${platform}: аккаунт привязан к пользователю ${link.link_user.slice(0, 8)}`)
      return st.confirm.run(link.link_user, code, Date.now() - LINK_TTL).changes === 1 && 'linked'
    }
    // Новый пользователь по ссылке-приглашению получает бонус, пригласивший — награду позже.
    const user = accounts.userFromIdentity(
      platform,
      profile.id,
      { name: profile.name || 'Пользователь' },
      link.ref ?? null,
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
    /** Запуск приёма сообщений Telegram опросом (вызывается сервером при старте). */
    startTelegram() {
      if (TELEGRAM_MODE !== 'webhook') void pollLoop()
    },
    stopTelegram() {
      polling.active = false
    },
    async handle(req, res, path, user) {
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
        const ref = typeof body.ref === 'string' && /^[\w-]{3,16}$/.test(body.ref) ? body.ref : null
        // link=true — привязать мессенджер к текущему аккаунту (нужно для бонуса за подписку).
        const linkUser = body.link === true && user ? user.id : null
        st.insert.run(code, sha(nonce), platform, Date.now(), ref, linkUser)
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
        if (link.user_id === 'taken') return send(res, 200, { status: 'taken' })
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
