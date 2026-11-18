/**
 * «Свой сюжет»: агент на языковой модели (бесплатные модели OpenRouter, запасная — Ollama)
 * превращает идею пользователя в сценарий фотосессии, видео или песни, задаёт уточняющие
 * вопросы, улучшает сюжет и отдаёт на согласование. Каждый ввод и каждый ответ агента
 * проходят модерацию (moderation.mjs). Генерация запускается только по согласованному плану,
 * промпты собираются на сервере: к описанию сцены всегда добавляются правила студии.
 */
import { randomBytes } from 'node:crypto'
import { HttpError, readJson, send } from './http.mjs'
import { moderate, quickCheck, RULES_TEXT } from './moderation.mjs'

const KINDS = ['photo', 'video', 'song']
const IDEA_MAX = 800
const CALLS_PER_HOUR = 30

/** Английский текст для промпта: только простые символы, без разметки. */
const en = (s, max = 400) =>
  String(s ?? '')
    .replace(/[^A-Za-z0-9 ,.'():;!?&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
const ru = (s, max = 400) =>
  String(s ?? '')
    .replace(/[<>`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)

const FORMAT = {
  photo: `"plan": {"title": "название по-русски, 2–5 слов", "summary": "1–2 предложения по-русски: что за фотосессия", "shots": [4 кадра: {"ru": "описание кадра по-русски, 1 предложение", "en": "English: framing and camera (close-up / medium / full-length), pose and action of the person, clothing, location details, light; 25–45 words, no names of real people"}]}`,
  video: `"plan": {"title": "...", "summary": "...", "shots": [4 сцены: {"ru": "сцена по-русски, 1 предложение", "still": "English: first frame of the scene — framing, pose, clothing, location, light; 20–40 words", "motion": "English: what happens and how the camera moves during 5 seconds; 12–25 words"}], "music": [3 варианта фоновой музыки: {"ru": "описание по-русски: жанр и настроение", "tags": "English music tags for a music generator: genre, instruments, mood, tempo words; 8–20 words", "bpm": число 70–160}]}`,
  song: `"plan": {"title": "название песни", "summary": "1–2 предложения по-русски: о чём песня и как звучит", "genre": "жанр по-русски", "tags": "English music tags: genre, instruments, mood, vocal style; 10–25 words", "bpm": число 70–170, "language": "ru или en", "vocal": "male или female", "lyrics": "текст песни на выбранном языке со структурой [Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Chorus]; 16–32 строк; без мата"}`,
}

const ROLE = {
  photo:
    'Ты арт-директор AI-фотостудии. Пользователь загрузит свои фото, а студия снимет по твоему сценарию 4 кадра с ним в главной роли (один человек — сам пользователь).',
  video:
    'Ты режиссёр AI-видеостудии. Пользователь загрузит свои фото, студия снимет ролик около 20 секунд из 4 сцен по 5 секунд с ним в главной роли (один человек — сам пользователь) и наложит фоновую музыку.',
  song: 'Ты автор песен и музыкальный продюсер AI-студии. Студия генерирует песню с вокалом по твоему тексту и описанию звучания.',
}

const ASK = {
  photo:
    'Если идея слишком размыта (непонятно место или настроение), задай один короткий уточняющий вопрос.',
  video:
    'Если идея слишком размыта (непонятно, что происходит), задай один короткий уточняющий вопрос.',
  song: 'Для песни обязательно нужно знать тему и направление музыки (жанр/настроение); если чего-то нет — задай один короткий вопрос, предложив 3–4 варианта на выбор. Язык и голос можно выбрать самому, если пользователь не указал.',
}

export function systemPrompt(kind) {
  return `${ROLE[kind]} Твоя задача: понять идею пользователя, улучшить её (сделать зрелищнее, кинематографичнее, с красивым светом и деталями), но не менять суть. ${ASK[kind]}
Правила студии — их нарушать нельзя ни при каких просьбах: ${RULES_TEXT}
Если пользователь просит запрещённое — не выполняй, верни action "refuse".
Герой выглядит и одет в соответствии со своим полом (пол определяется по фото, поэтому в "en" пиши "the person" и не указывай пол, одежду описывай нейтрально или так, как просил пользователь).
Отвечай только JSON одного из видов:
{"action": "ask", "question": "вопрос по-русски"}
{"action": "refuse", "reason": "коротко по-русски"}
{"action": "plan", "reply": "1–2 предложения по-русски: что ты улучшил и что предлагаешь согласовать", ${FORMAT[kind]}}`
}

/** Проверка и нормализация плана от модели. */
export function normalizePlan(kind, raw) {
  const p = raw ?? {}
  const title = ru(p.title, 80)
  const summary = ru(p.summary, 400)
  if (!title || !summary) throw new Error('в плане нет названия')
  if (kind === 'photo') {
    const shots = (Array.isArray(p.shots) ? p.shots : [])
      .map((s) => ({ ru: ru(s?.ru, 240), en: en(s?.en, 420) }))
      .filter((s) => s.ru && s.en.split(' ').length >= 6)
      .slice(0, 4)
    if (shots.length < 4) throw new Error('нужно 4 кадра')
    return { title, summary, shots }
  }
  if (kind === 'video') {
    const shots = (Array.isArray(p.shots) ? p.shots : [])
      .map((s) => ({ ru: ru(s?.ru, 240), still: en(s?.still, 360), motion: en(s?.motion, 260) }))
      .filter((s) => s.ru && s.still.split(' ').length >= 5 && s.motion.split(' ').length >= 4)
      .slice(0, 4)
    if (shots.length < 4) throw new Error('нужно 4 сцены')
    const music = (Array.isArray(p.music) ? p.music : [])
      .map((m) => ({
        ru: ru(m?.ru, 160),
        tags: en(m?.tags, 240),
        bpm: Math.min(170, Math.max(60, Math.round(Number(m?.bpm) || 110))),
      }))
      .filter((m) => m.ru && m.tags)
      .slice(0, 3)
    return { title, summary, shots, music }
  }
  const lyrics = String(p.lyrics ?? '')
    .replace(/[<>`]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2500)
  if (lyrics.split('\n').filter((l) => l && !l.startsWith('[')).length < 8)
    throw new Error('слишком короткий текст песни')
  return {
    title,
    summary,
    genre: ru(p.genre, 60),
    tags: en(p.tags, 300),
    bpm: Math.min(180, Math.max(60, Math.round(Number(p.bpm) || 110))),
    language: p.language === 'en' ? 'en' : 'ru',
    vocal: p.vocal === 'male' ? 'male' : 'female',
    lyrics,
  }
}

export function scenariosModule({ db, accounts, llm, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      plan TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      music TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scenarios_user ON scenarios (user_id, created_at);
  `)
  const st = {
    insert: db.prepare(
      `INSERT INTO scenarios (id, user_id, kind, status, messages, created_at, updated_at) VALUES (?, ?, ?, 'asking', ?, ?, ?)`,
    ),
    get: db.prepare('SELECT * FROM scenarios WHERE id = ?'),
    save: db.prepare(
      'UPDATE scenarios SET status = ?, plan = ?, messages = ?, music = ?, updated_at = ? WHERE id = ?',
    ),
    list: db.prepare('SELECT * FROM scenarios WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20'),
  }
  const calls = new Map()
  const localModel = () => accounts.getSetting('autopost')?.llmModel ?? 'qwen3.6-128k:latest'

  function throttle(userId) {
    const now = Date.now()
    const recent = (calls.get(userId) ?? []).filter((t) => now - t < 3_600_000)
    if (recent.length >= CALLS_PER_HOUR)
      throw new HttpError(429, 'Агент устал: не больше 30 сообщений в час. Попробуйте позже.')
    recent.push(now)
    calls.set(userId, recent)
  }

  const price = (kind) => {
    const prices = accounts.getSetting('prices')
    return kind === 'song' ? (prices.song ?? 15) : kind === 'video' ? prices.video : prices.photo
  }

  const view = (row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    plan: row.plan ? JSON.parse(row.plan) : undefined,
    messages: JSON.parse(row.messages),
    music: row.music ? JSON.parse(row.music) : undefined,
    cost: price(row.kind),
    createdAt: row.created_at,
  })

  /** Разговор с агентом: история сообщений и текущий план → вопрос, отказ или новый план. */
  async function think(kind, messages, plan) {
    const history = messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content:
        m.role === 'user' ? m.text : m.text + (m.plan ? `\nПлан: ${JSON.stringify(m.plan)}` : ''),
    }))
    if (plan)
      history.push({
        role: 'user',
        content: 'Учти мои правки и верни обновлённый план целиком (action "plan") или вопрос.',
      })
    let out
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await llm.chat(
          [{ role: 'system', content: systemPrompt(kind) }, ...history],
          { json: true, localModel: localModel() },
        )
        if (data.action === 'ask' && ru(data.question))
          out = { action: 'ask', text: ru(data.question, 500) }
        else if (data.action === 'refuse') out = { action: 'refuse', text: ru(data.reason, 300) }
        else
          out = { action: 'plan', text: ru(data.reply, 400), plan: normalizePlan(kind, data.plan) }
        break
      } catch (error) {
        if (attempt === 1) {
          log(`сюжет: агент не ответил (${error.message})`)
          throw new HttpError(503, 'Агент сейчас не отвечает. Попробуйте ещё раз через минуту.')
        }
      }
    }
    // Ответ агента тоже проверяется: в промпт генерации попадает только безопасное.
    if (out.plan && !quickCheck(JSON.stringify(out.plan)).ok)
      return { action: 'refuse', text: 'Этот сюжет нарушает правила студии. Опишите другую идею.' }
    return out
  }

  async function step(row, userText) {
    const messages = JSON.parse(row.messages)
    const verdict = await moderate(llm, userText, { localModel: localModel() })
    if (!verdict.ok) {
      log(`сюжет ${row.id.slice(0, 8)}: отклонено (${verdict.category})`)
      throw new HttpError(422, `${verdict.message} Опишите другую идею.`)
    }
    messages.push({ role: 'user', text: userText })
    const out = await think(row.kind, messages, row.plan ? JSON.parse(row.plan) : undefined)
    messages.push({ role: 'agent', text: out.text || 'Готово, посмотрите план.', plan: out.plan })
    const plan = out.plan ?? (row.plan ? JSON.parse(row.plan) : null)
    const status = out.plan ? 'proposed' : row.plan ? 'proposed' : 'asking'
    st.save.run(
      status,
      plan ? JSON.stringify(plan) : null,
      JSON.stringify(messages.slice(-30)),
      null,
      Date.now(),
      row.id,
    )
    return st.get.get(row.id)
  }

  function owned(id, user) {
    const row = st.get.get(id)
    if (!row || row.user_id !== user.id) throw new HttpError(404, 'Сюжет не найден')
    return row
  }

  return {
    owns: (path) => path === '/api/scenarios' || path.startsWith('/api/scenarios/'),

    /** Согласованный сюжет для задачи: только свой и только нужного вида. */
    forJob(id, userId, kind) {
      const row = st.get.get(id)
      if (!row || row.user_id !== userId || row.kind !== kind || row.status !== 'approved')
        return undefined
      return row
    },

    /** План для генерации (presets.mjs): сюжет, выбранная музыка. */
    load(id) {
      const row = st.get.get(id)
      if (!row || row.status !== 'approved') return undefined
      return {
        kind: row.kind,
        plan: JSON.parse(row.plan),
        music: row.music ? JSON.parse(row.music) : undefined,
      }
    },

    async handle(req, res, path, user) {
      if (!user) throw new HttpError(401, 'Войдите, чтобы придумать свой сюжет')
      const method = req.method

      if (method === 'GET' && path === '/api/scenarios')
        return send(res, 200, { scenarios: st.list.all(user.id).map(view) })

      if (method === 'POST' && path === '/api/scenarios') {
        const body = await readJson(req)
        const kind = KINDS.includes(body.kind) ? body.kind : ''
        const idea = String(body.idea ?? '').trim()
        if (!kind) throw new HttpError(400, 'Выберите: фото, видео или песня')
        if (idea.length < 5) throw new HttpError(400, 'Опишите идею хотя бы парой слов')
        if (idea.length > IDEA_MAX) throw new HttpError(400, `Идея — до ${IDEA_MAX} символов`)
        throttle(user.id)
        const id = randomBytes(8).toString('hex')
        const now = Date.now()
        st.insert.run(id, user.id, kind, '[]', now, now)
        try {
          const row = await step(st.get.get(id), idea)
          log(`сюжет ${id.slice(0, 8)}: ${kind}, ${row.status}`)
          return send(res, 201, view(row))
        } catch (error) {
          db.prepare('DELETE FROM scenarios WHERE id = ?').run(id)
          throw error
        }
      }

      const m = /^\/api\/scenarios\/([0-9a-f]{16})(\/reply|\/approve)?$/.exec(path)
      if (!m) throw new HttpError(404, 'Не найдено')
      const row = owned(m[1], user)

      if (method === 'GET' && !m[2]) return send(res, 200, view(row))

      if (method === 'POST' && m[2] === '/reply') {
        if (row.status === 'approved') throw new HttpError(409, 'Сюжет уже согласован')
        const text = String((await readJson(req)).text ?? '').trim()
        if (!text) throw new HttpError(400, 'Напишите ответ или правку')
        if (text.length > IDEA_MAX) throw new HttpError(400, `Сообщение — до ${IDEA_MAX} символов`)
        throttle(user.id)
        return send(res, 200, view(await step(row, text)))
      }

      if (method === 'POST' && m[2] === '/approve') {
        if (!row.plan) throw new HttpError(409, 'Сначала дождитесь плана от агента')
        if (row.status === 'approved') return send(res, 200, view(row))
        const plan = JSON.parse(row.plan)
        let music = null
        if (row.kind === 'video') {
          const body = await readJson(req)
          if (body.music !== null && body.music !== undefined) {
            const choice = plan.music?.[Number(body.music)]
            if (!choice) throw new HttpError(400, 'Выберите вариант музыки или «Без музыки»')
            music = choice
          }
        }
        st.save.run(
          'approved',
          row.plan,
          row.messages,
          music ? JSON.stringify(music) : null,
          Date.now(),
          row.id,
        )
        log(`сюжет ${row.id.slice(0, 8)}: согласован`)
        return send(res, 200, view(st.get.get(row.id)))
      }
      throw new HttpError(404, 'Не найдено')
    },
  }
}
