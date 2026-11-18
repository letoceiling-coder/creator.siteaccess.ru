/**
 * Публикации в каналы через ботов: Telegram (Bot API, через прокси) и MAX (platform API).
 * Пост — текст с простой разметкой, до 10 фото/видео (галерея), необязательная кнопка-ссылка.
 * Ограничения платформ проверяются до отправки; см. docs/CHANNELS.md.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { HttpError, readJson, send } from './http.mjs'
import { sniff } from './images.mjs'

const TELEGRAM_API = process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org'
const TELEGRAM_PROXY = process.env.TELEGRAM_PROXY ?? ''
const MAX_API = process.env.MAX_API_URL ?? 'https://platform-api.max.ru'
const MB = 1024 * 1024

/** Ограничения платформ (Bot API Telegram; dev.max.ru, раздел «Отправка медиафайлов»). */
export const limits = {
  telegram: { text: 4096, caption: 1024, media: 10, photo: 10 * MB, video: 50 * MB },
  max: { text: 4000, media: 12, photo: 50 * MB, video: 250 * MB },
  /** Общие для поста: самое строгое из платформ. */
  post: { media: 10, body: 260 * MB },
}

const VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
}

/** Разметка автора: **жирный**, _курсив_, [текст](https://ссылка). */
function toTelegramHtml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?)]|$)/g, '$1<i>$2</i>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, t, u) => `<a href="${u.replace(/"/g, '&quot;')}">${t}</a>`,
    )
}

/** Строка для файла настроек curl (-K): кавычки, обратный слеш и переводы строк экранируются. */
const quote = (s) =>
  `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`

function curl(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('curl', args, { maxBuffer: 8 * MB })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`curl ${code}`))))
    child.stdin.end(input ?? '')
  })
}

export function channelsModule({ db, accounts, config, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      username TEXT,
      can_post INTEGER NOT NULL DEFAULT 0,
      removed INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      media TEXT NOT NULL,
      button TEXT,
      results TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  const st = {
    upsert:
      db.prepare(`INSERT INTO channels (id, platform, chat_id, title, username, can_post, removed, added_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, username = excluded.username,
        can_post = excluded.can_post, removed = 0`),
    list: db.prepare('SELECT * FROM channels WHERE removed = 0 ORDER BY added_at'),
    get: db.prepare('SELECT * FROM channels WHERE id = ? AND removed = 0'),
    remove: db.prepare('UPDATE channels SET removed = 1 WHERE id = ?'),
    insertPost: db.prepare(
      `INSERT INTO posts (id, author_id, text, media, button, status, created_at) VALUES (?, ?, ?, ?, ?, 'sending', ?)`,
    ),
    finishPost: db.prepare('UPDATE posts SET results = ?, status = ? WHERE id = ?'),
    posts: db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50'),
  }

  const integrations = () => accounts.getSetting('integrations')
  const workDir = join(config.dataDir, 'posts')
  mkdirSync(workDir, { recursive: true })

  /* ── Telegram ── */

  async function tg(method, fields, { files = [], timeout = 60 } = {}) {
    const token = integrations().telegram.botToken
    if (!token) throw new Error('Не задан токен бота Telegram')
    const args = ['-s', '-m', String(timeout), '-K', '-']
    if (TELEGRAM_PROXY) args.unshift('-x', TELEGRAM_PROXY)
    // Адрес с токеном и поля поста — через stdin в UTF-8: не видны в списке процессов
    // и не зависят от кодировки командной строки.
    const lines = [`url = ${quote(`${TELEGRAM_API}/bot${token}/${method}`)}`]
    for (const [k, v] of Object.entries(fields))
      if (v !== undefined)
        lines.push(
          `form-string = ${quote(`${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)}`,
        )
    for (const f of files) lines.push(`form = ${quote(`${f.field}=@${f.path};type=${f.type}`)}`)
    const out = await curl(args, lines.join('\n') + '\n')
    const res = JSON.parse(out || '{}')
    if (!res.ok) throw new Error(`Telegram: ${res.description ?? 'ошибка'}`)
    return res.result
  }

  async function addTelegram(ref) {
    const chatId = /^-?\d+$/.test(ref) ? ref : `@${ref.replace(/^@|^https?:\/\/t\.me\//g, '')}`
    const chat = await tg('getChat', { chat_id: chatId })
    if (chat.type !== 'channel') throw new HttpError(400, 'Это не канал Telegram')
    const me = await tg('getMe', {})
    const member = await tg('getChatMember', { chat_id: chat.id, user_id: me.id })
    const canPost =
      member.status === 'creator' || (member.status === 'administrator' && member.can_post_messages)
    st.upsert.run(
      `telegram:${chat.id}`,
      'telegram',
      String(chat.id),
      chat.title,
      chat.username ?? null,
      canPost ? 1 : 0,
      Date.now(),
    )
    return st.get.get(`telegram:${chat.id}`)
  }

  async function publishTelegram(channel, post, files) {
    const html = toTelegramHtml(post.text)
    const keyboard = post.button
      ? { inline_keyboard: [[{ text: post.button.text, url: post.button.url }]] }
      : undefined
    const ids = []
    const captionFits = html.length > 0 && post.text.length <= limits.telegram.caption
    if (files.length === 0) {
      const m = await tg('sendMessage', {
        chat_id: channel.chat_id,
        text: html,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      ids.push(m.message_id)
    } else if (files.length === 1) {
      const f = files[0]
      const method = f.kind === 'video' ? 'sendVideo' : 'sendPhoto'
      const m = await tg(
        method,
        {
          chat_id: channel.chat_id,
          caption: captionFits ? html : undefined,
          parse_mode: captionFits ? 'HTML' : undefined,
          reply_markup: captionFits ? keyboard : undefined,
          supports_streaming: f.kind === 'video' ? 'true' : undefined,
        },
        { files: [{ field: f.kind, path: f.path, type: f.type }], timeout: 300 },
      )
      ids.push(m.message_id)
    } else {
      const media = files.map((f, i) => ({
        type: f.kind,
        media: `attach://file${i}`,
        ...(i === 0 && captionFits ? { caption: html, parse_mode: 'HTML' } : {}),
      }))
      const ms = await tg(
        'sendMediaGroup',
        { chat_id: channel.chat_id, media },
        {
          files: files.map((f, i) => ({ field: `file${i}`, path: f.path, type: f.type })),
          timeout: 300,
        },
      )
      ids.push(...ms.map((m) => m.message_id))
    }
    // Длинный текст или кнопка к альбому — отдельным сообщением после медиа.
    const textLeft = files.length > 0 && html.length > 0 && !captionFits
    const buttonLeft = keyboard && (files.length > 1 || (files.length === 1 && !captionFits))
    if (textLeft || buttonLeft) {
      const m = await tg('sendMessage', {
        chat_id: channel.chat_id,
        text: textLeft ? html : '👇',
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      ids.push(m.message_id)
    }
    return {
      messages: ids.length,
      url: channel.username ? `https://t.me/${channel.username}/${ids[0]}` : undefined,
    }
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
    if (!res.ok || data.success === false) {
      const error = new Error(`MAX: ${data.message ?? data.code ?? res.status}`)
      error.code = data.code
      throw error
    }
    return data
  }

  async function addMax(chatId) {
    if (!/^-?\d+$/.test(String(chatId))) throw new HttpError(400, 'ID канала MAX — число')
    const chat = await max('GET', `/chats/${chatId}`)
    // Публиковать может владелец или администратор с правом «write».
    const me = await max('GET', `/chats/${chatId}/members/me`).catch(() => undefined)
    const canPost = me
      ? Boolean(
          me.is_owner ||
          (me.is_admin && (!Array.isArray(me.permissions) || me.permissions.includes('write'))),
        )
      : true
    st.upsert.run(
      `max:${chatId}`,
      'max',
      String(chatId),
      chat.title ?? `Канал ${chatId}`,
      chat.link ?? null,
      canPost ? 1 : 0,
      Date.now(),
    )
    return st.get.get(`max:${chatId}`)
  }

  /** Загрузка файла в MAX: получить адрес, отправить файл, вернуть токен вложения. */
  async function maxUpload(file) {
    const { url, token } = await max(
      'POST',
      `/uploads?type=${file.kind === 'video' ? 'video' : 'image'}`,
    )
    // Заголовок с токеном — через stdin, чтобы его не было в списке процессов.
    const out = await curl(
      ['-s', '-m', '600', '-K', '-', '-F', `data=@${file.path};type=${file.type}`],
      `url = "${url}"\nheader = "Authorization: ${integrations().max.botToken}"\n`,
    )
    if (file.kind === 'video') return token
    const parsed = JSON.parse(out || '{}')
    const photo = Object.values(parsed.photos ?? {})[0]
    if (!photo?.token) throw new Error('MAX не вернул токен изображения')
    return photo.token
  }

  async function publishMax(channel, post, files) {
    const attachments = []
    for (const f of files)
      attachments.push({
        type: f.kind === 'video' ? 'video' : 'image',
        payload: { token: await maxUpload(f) },
      })
    if (post.button)
      attachments.push({
        type: 'inline_keyboard',
        payload: { buttons: [[{ type: 'link', text: post.button.text, url: post.button.url }]] },
      })
    const body = {
      text: post.text || undefined,
      format: 'markdown',
      attachments: attachments.length ? attachments : undefined,
    }
    // Видео и крупные фото обрабатываются после загрузки: повторяем отправку с растущей паузой.
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await max(
          'POST',
          `/messages?chat_id=${encodeURIComponent(channel.chat_id)}`,
          body,
        )
        return { messages: 1, url: res.message?.url ?? undefined }
      } catch (error) {
        if (error.code !== 'attachment.not.ready' || attempt >= 7) throw error
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt))
      }
    }
  }

  /* ── приём поста ── */

  async function readPost(req) {
    const type = req.headers['content-type'] ?? ''
    if (!type.startsWith('multipart/form-data'))
      throw new HttpError(415, 'Ожидается multipart/form-data')
    let seen = 0
    const limiter = new Transform({
      transform(chunk, _e, cb) {
        seen += chunk.length
        if (seen > limits.post.body)
          cb(new HttpError(413, 'Слишком большой пост: до 260 МБ вместе с файлами'))
        else cb(null, chunk)
      },
    })
    const request = new Request('http://local/', {
      method: 'POST',
      headers: { 'content-type': type },
      body: Readable.toWeb(req.pipe(limiter)),
      duplex: 'half',
    })
    try {
      return await request.formData()
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(400, 'Не удалось прочитать пост')
    }
  }

  function validate(post, files, targets) {
    const problems = []
    if (!post.text.trim() && files.length === 0)
      problems.push('Пост пустой: добавьте текст или файлы')
    if (files.length > limits.post.media)
      problems.push(`Не больше ${limits.post.media} фото и видео в посте`)
    for (const ch of targets) {
      const l = limits[ch.platform]
      if (post.text.length > l.text) problems.push(`${ch.title}: текст длиннее ${l.text} символов`)
      for (const f of files) {
        const cap = f.kind === 'video' ? l.video : l.photo
        if (f.size > cap)
          problems.push(
            `${ch.title}: «${f.name}» больше ${Math.round(cap / MB)} МБ (${f.kind === 'video' ? 'видео' : 'фото'})`,
          )
      }
    }
    return [...new Set(problems)]
  }

  const view = (c) => ({
    id: c.id,
    platform: c.platform,
    chatId: c.chat_id,
    title: c.title,
    username: c.username ?? undefined,
    canPost: Boolean(c.can_post),
  })

  return {
    limits,
    /** Канал MAX из события bot_added / bot_removed (вебхук бота). */
    async onMaxUpdate(update) {
      if (update.update_type === 'bot_added' && update.chat_id) {
        await addMax(update.chat_id).catch((e) => log(`MAX канал ${update.chat_id}: ${e.message}`))
      } else if (update.update_type === 'bot_removed' && update.chat_id) {
        st.remove.run(`max:${update.chat_id}`)
      }
    },

    owns: (path) => path.startsWith('/api/admin/channels') || path.startsWith('/api/admin/posts'),

    async handle(req, res, path, user) {
      const method = req.method

      if (method === 'GET' && path === '/api/admin/channels') {
        return send(res, 200, { channels: st.list.all().map(view), limits })
      }
      if (method === 'POST' && path === '/api/admin/channels') {
        const body = await readJson(req)
        try {
          const ch =
            body.platform === 'max'
              ? await addMax(String(body.ref ?? '').trim())
              : await addTelegram(String(body.ref ?? '').trim())
          return send(res, 201, { channel: view(ch) })
        } catch (error) {
          if (error instanceof HttpError) throw error
          throw new HttpError(400, `Канал не найден или бот не добавлен в него: ${error.message}`)
        }
      }
      const del = /^\/api\/admin\/channels\/((?:telegram|max):-?\d+)$/.exec(path)
      if (method === 'DELETE' && del) {
        st.remove.run(del[1])
        return send(res, 200, { channels: st.list.all().map(view) })
      }

      if (method === 'GET' && path === '/api/admin/posts') {
        return send(res, 200, {
          posts: st.posts.all().map((p) => ({
            id: p.id,
            text: p.text,
            media: JSON.parse(p.media),
            button: p.button ? JSON.parse(p.button) : undefined,
            results: JSON.parse(p.results),
            status: p.status,
            createdAt: p.created_at,
          })),
        })
      }

      if (method === 'POST' && path === '/api/admin/posts') {
        const form = await readPost(req)
        const field = (k) => {
          const v = form.get(k)
          return typeof v === 'string' ? v : ''
        }
        const text = field('text').replace(/\r\n/g, '\n').trim()
        const channelIds = form.getAll('channels').map(String)
        const buttonText = field('buttonText').trim()
        const buttonUrl = field('buttonUrl').trim()
        if (buttonText && !/^https:\/\/[^\s]+$/.test(buttonUrl))
          throw new HttpError(400, 'Ссылка кнопки должна начинаться с https://')
        if (buttonText.length > 64) throw new HttpError(400, 'Текст кнопки — до 64 символов')
        const button = buttonText ? { text: buttonText, url: buttonUrl } : undefined
        const targets = channelIds.map((id) => st.get.get(id)).filter(Boolean)
        if (targets.length === 0) throw new HttpError(400, 'Выберите хотя бы один канал')
        const blocked = targets.filter((c) => !c.can_post)
        if (blocked.length)
          throw new HttpError(
            400,
            `Бот не может публиковать в: ${blocked.map((c) => c.title).join(', ')}`,
          )

        const postId = randomBytes(10).toString('hex')
        const dir = join(workDir, postId)
        mkdirSync(dir, { recursive: true })
        const files = []
        try {
          for (const [i, f] of form.getAll('files').entries()) {
            if (typeof f !== 'object' || !f) continue
            const buf = Buffer.from(await f.arrayBuffer())
            const image = sniff(buf)
            const videoExt = VIDEO_TYPES[f.type]
            const isMp4 = buf.subarray(4, 8).toString('latin1') === 'ftyp'
            const isWebm = buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
            if (!image && !(videoExt && (isMp4 || isWebm)))
              throw new HttpError(
                415,
                `«${f.name}»: подходят JPEG, PNG, WebP и видео MP4, MOV, WebM, MKV`,
              )
            const kind = image ? 'photo' : 'video'
            const ext = image ? (image === 'jpeg' ? 'jpg' : image) : videoExt
            const path2 = join(dir, `${i}.${ext}`)
            writeFileSync(path2, buf)
            files.push({
              kind,
              path: path2,
              size: buf.length,
              name: String(f.name).slice(0, 120),
              type: image ? `image/${image}` : f.type,
            })
          }
          const post = { text, button }
          const problems = validate(post, files, targets)
          if (problems.length) throw new HttpError(400, problems.join('. '))

          st.insertPost.run(
            postId,
            user.id,
            text,
            JSON.stringify(files.map((f) => ({ kind: f.kind, name: f.name, size: f.size }))),
            button ? JSON.stringify(button) : null,
            Date.now(),
          )
          const results = []
          for (const ch of targets) {
            try {
              const r =
                ch.platform === 'telegram'
                  ? await publishTelegram(ch, post, files)
                  : await publishMax(ch, post, files)
              results.push({
                channel: ch.id,
                title: ch.title,
                platform: ch.platform,
                ok: true,
                ...r,
              })
            } catch (error) {
              log(`пост ${postId.slice(0, 8)} → ${ch.id}: ${error.message}`)
              results.push({
                channel: ch.id,
                title: ch.title,
                platform: ch.platform,
                ok: false,
                error: error.message,
              })
            }
          }
          const status = results.every((r) => r.ok)
            ? 'sent'
            : results.some((r) => r.ok)
              ? 'partial'
              : 'failed'
          st.finishPost.run(JSON.stringify(results), status, postId)
          log(`админ ${user.id.slice(0, 8)}: пост ${postId.slice(0, 8)} — ${status}`)
          return send(res, 201, { id: postId, status, results })
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      }
      throw new HttpError(404, 'Не найдено')
    },
  }
}
