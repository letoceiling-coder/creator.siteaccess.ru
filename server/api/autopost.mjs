/**
 * Агент публикаций: по расписанию сам делает пост для каналов — фотосессию (4 кадра одного
 * вымышленного героя) или короткий ролик по сюжету каталога, пишет текст через локальную
 * языковую модель (Ollama) и публикует через модуль каналов. Настройки — в админке
 * («Автопостинг»). Генерация идёт в общей очереди ComfyUI после задач пользователей.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { assembleShots } from '../factory/assemble.mjs'
import {
  download,
  qwenEditWorkflow,
  qwenImageWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from '../factory/comfy.mjs'
import { imageHasFace, MIN_FACE_RATIO, videoFaceRatio } from '../factory/faces.mjs'
import { photoCategories, photoStories } from '../factory/photo-stories.mjs'
import { stories } from '../factory/stories.mjs'
import { camera, directShots, lighting } from './directing.mjs'
import { HttpError, readJson, send } from './http.mjs'
import { toJpeg, toWebp } from './images.mjs'
import { extraPeopleNegative, faceVisible, negative, onlyOne } from './presets.mjs'
import { FEMININE_WEAR, genderClause, genderNegative, storyGender } from './gender.mjs'

const TEST_IMAGE = process.env.AUTOPOST_TEST_IMAGE ?? ''
const KEEP_MEDIA_MS = 30 * 86_400_000

export const autopostDefaults = {
  enabled: false,
  intervalMin: 60,
  from: '09:00',
  to: '21:00',
  kinds: { photo: true, video: true },
  channels: [],
  autoPublish: true,
  buttonText: '⚡ Сгенерировать ⚡',
  llmModel: 'qwen3.6-128k:latest',
}

/** Минуты от полуночи по Москве. */
function moscowMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Попадает ли момент в окно публикаций (по Москве); окно может переходить через полночь. */
export function inWindow(from, to, date) {
  const m = moscowMinutes(date)
  const a = toMin(from)
  const b = toMin(to)
  if (a === b) return true
  return a < b ? m >= a && m < b : m >= a || m < b
}

/** Ближайший момент запуска: не раньше интервала после прошлого поста и внутри окна. */
export function nextRunAt(cfg, lastStart, now) {
  let t = Math.max(now, lastStart + cfg.intervalMin * 60_000)
  for (let i = 0; i < 24 * 60 && !inWindow(cfg.from, cfg.to, new Date(t)); i++) t += 60_000
  return t
}

const style = `${camera}. Photorealistic, natural skin texture, realistic hands.`
const videoStyle = `${camera}.`
const videoNegative =
  'blurry, distorted face, changing face, hands covering the face, extra limbs, extra fingers, static, jitter, flicker, watermark, text, morphing'
const sizes = {
  '9:16': { still: [928, 1664], video: [480, 832] },
  '16:9': { still: [1664, 928], video: [832, 480] },
  '1:1': { still: [1328, 1328], video: [640, 640] },
}
/** Вымышленные герои; пол героя определяет его образ (см. gender.mjs). */
const cast = [
  ['a young woman with long dark hair', 'female'],
  ['a man in his early 30s with short dark hair and light stubble', 'male'],
  ['a woman in her late 20s with wavy auburn hair and freckles', 'female'],
  ['a woman in her 30s with a sleek blonde bob', 'female'],
  ['a young man with curly brown hair', 'male'],
  ['a woman in her 40s with elegant shoulder-length chestnut hair', 'female'],
  ['a young woman of East Asian appearance with straight black hair', 'female'],
  ['a man in his 40s with salt-and-pepper hair and a neat beard', 'male'],
  ['a young woman with dark skin and long braids', 'female'],
  ['a young woman with platinum blonde long hair', 'female'],
].map(([who, gender]) => ({ who, gender }))

/** Герой под сюжет: для «женских» и «мужских» сюжетов — только подходящего пола. */
function pickHero(story) {
  const need = storyGender(story)
  return pick(need === 'any' ? cast : cast.filter((c) => c.gender === need))
}
/** Ошибка для админки: без трассировок (старые записи могли сохранить ответ ComfyUI целиком). */
function shortError(message) {
  if (/OutOfMemory|out of memory/i.test(message)) return 'Не хватило видеопамяти GPU'
  const text = String(message).replace(/\s+/g, ' ').trim()
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const seed = () => Math.floor(Math.random() * 2 ** 31)
const categoryName = Object.fromEntries(photoCategories)

export function autopostModule({ db, accounts, config, log, q, channels, llm }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autoposts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      story_id TEXT NOT NULL,
      story_title TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT,
      text TEXT NOT NULL DEFAULT '',
      media TEXT NOT NULL DEFAULT '[]',
      button TEXT,
      results TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
  `)
  try {
    db.exec('ALTER TABLE autoposts ADD COLUMN model TEXT')
  } catch {
    // колонка уже есть
  }
  const st = {
    insert: db.prepare(
      `INSERT INTO autoposts (id, kind, story_id, story_title, status, step, created_at) VALUES (?, ?, ?, ?, 'generating', ?, ?)`,
    ),
    step: db.prepare('UPDATE autoposts SET step = ? WHERE id = ?'),
    model: db.prepare('UPDATE autoposts SET model = ? WHERE id = ?'),
    ready: db.prepare(
      `UPDATE autoposts SET status = ?, step = NULL, text = ?, media = ?, button = ? WHERE id = ?`,
    ),
    status: db.prepare('UPDATE autoposts SET status = ?, step = NULL WHERE id = ?'),
    text: db.prepare(`UPDATE autoposts SET text = ? WHERE id = ? AND status = 'draft'`),
    done: db.prepare(
      'UPDATE autoposts SET status = ?, step = NULL, results = ?, error = ?, finished_at = ? WHERE id = ?',
    ),
    fail: db.prepare(
      `UPDATE autoposts SET status = 'failed', step = NULL, error = ?, finished_at = ? WHERE id = ?`,
    ),
    get: db.prepare('SELECT * FROM autoposts WHERE id = ?'),
    remove: db.prepare(`DELETE FROM autoposts WHERE id = ? AND status IN ('draft', 'failed')`),
    list: db.prepare('SELECT * FROM autoposts ORDER BY created_at DESC LIMIT 30'),
    last: db.prepare('SELECT created_at, kind FROM autoposts ORDER BY created_at DESC LIMIT 1'),
    recent: db.prepare('SELECT story_id FROM autoposts ORDER BY created_at DESC LIMIT 60'),
    old: db.prepare('SELECT id FROM autoposts WHERE created_at < ?'),
    interrupted: db.prepare(
      `UPDATE autoposts SET status = 'failed', step = NULL, error = 'Прервано перезапуском сервера' WHERE status IN ('generating', 'publishing')`,
    ),
  }
  st.interrupted.run()

  const root = join(config.mediaDir, 'autopost')
  mkdirSync(root, { recursive: true })
  const state = { running: '', timer: undefined }

  function settings() {
    return { ...structuredClone(autopostDefaults), ...(accounts.getSetting('autopost') ?? {}) }
  }

  /* ── выбор сюжета ── */

  function chooseKind(cfg) {
    const kinds = ['photo', 'video'].filter((k) => cfg.kinds[k])
    if (kinds.length < 2) return kinds[0] ?? 'photo'
    // Чередуем: после фото — видео и наоборот.
    return st.last.get()?.kind === 'photo' ? 'video' : 'photo'
  }

  function chooseStory(kind) {
    const used = new Set(st.recent.all().map((r) => r.story_id))
    const pool =
      kind === 'photo'
        ? photoStories.filter((s) => !s.legacy && s.props)
        : stories.filter((s) => s.people === 1 && sizes[s.ratio])
    const fresh = pool.filter((s) => !used.has(s.id))
    return pick(fresh.length ? fresh : pool)
  }

  /* ── генерация ── */

  async function withFace(make) {
    let first
    for (let attempt = 0; attempt < 3; attempt++) {
      const buf = await make(attempt)
      first ??= buf
      if ((await imageHasFace(buf)).ok) return buf
    }
    return first
  }

  async function saveImage(dir, i, buf) {
    const png = join(dir, `${i}.png`)
    writeFileSync(png, buf)
    await toJpeg(png, join(dir, `${i}.jpg`))
    await toWebp(png, join(dir, `${i}-thumb.webp`), 420)
    rmSync(png)
  }

  const mediaUrl = (id, file) => `/media/autopost/${id}/${file}`

  async function makePhotos(id, story, dir, step, look, hero) {
    if (TEST_IMAGE) {
      for (let i = 0; i < 4; i++) copyFileSync(TEST_IMAGE, join(dir, `${i}.jpg`))
      return [0, 1, 2, 3].map((i) => ({ kind: 'photo', file: `${i}.jpg`, thumb: `${i}.jpg` }))
    }
    const [prop, , move, mood] = story.props
    const { who, gender } = hero
    step('Обложка фотосессии')
    const cover = await withFace(async () => {
      const files = await runWorkflow(
        qwenImageWorkflow({
          prompt: `Editorial medium-full shot, 35mm lens, the location is clearly visible around the person. Subject: ${who}${look ? `, ${look}` : ''}, with ${prop}, ${move}, expression ${mood}. ${genderClause(gender)} ${onlyOne} Location: ${story.scene}. Light: ${lighting.day}. Palette: ${story.palette}. ${faceVisible} ${style}`,
          negative: `${negative}, ${extraPeopleNegative}, ${genderNegative(gender)}`,
          width: 1104,
          height: 1472,
          seed: seed(),
          prefix: `creator/autopost/${id}-0`,
        }),
      )
      return download(files[0])
    })
    await saveImage(dir, 0, cover)
    const ref = await uploadImage(cover, `creator-ap-${id}.png`)
    const shots = directShots(story.id, story.props)
    for (const [k, idx] of [0, 2, 3].entries()) {
      const shot = shots[idx]
      step(`Кадр ${k + 2} из 4`)
      const buf = await withFace(async () => {
        const files = await runWorkflow(
          qwenEditWorkflow({
            images: [ref],
            prompt: `${shot.camera}. Subject: the person from the reference photo, ${shot.pose}. Location: ${story.scene}. Light: ${lighting.day}. Palette: ${story.palette}. ${faceVisible} Keep the face and identity exactly the same as in the reference, do not copy its pose or framing. ${style}`,
            negative: `${negative}, ${extraPeopleNegative}, ${genderNegative(gender)}`,
            seed: seed(),
            width: 1104,
            height: 1472,
            prefix: `creator/autopost/${id}-${k + 1}`,
          }),
        )
        return download(files[0])
      })
      await saveImage(dir, k + 1, buf)
    }
    return [0, 1, 2, 3].map((i) => ({ kind: 'photo', file: `${i}.jpg`, thumb: `${i}-thumb.webp` }))
  }

  async function wanClip(id, tag, imageBuf, beat, sz, file) {
    let best = { ratio: -1 }
    for (let attempt = 0; attempt < 2; attempt++) {
      const image = await uploadImage(imageBuf, `creator-ap-${id}-${tag}.png`)
      const files = await runWorkflow(
        wanVideoWorkflow({
          image,
          prompt: `${beat.motion}, cinematic, natural realistic motion, the face stays visible, consistent and inside the frame`,
          negative: videoNegative,
          width: sz.video[0],
          height: sz.video[1],
          seed: seed(),
          prefix: `creator/autopost/${id}-${tag}`,
          finish: true,
        }),
        { timeoutMs: 1_800_000 },
      )
      const tmp = `${file}.${attempt}.mp4`
      writeFileSync(tmp, await download(files[0]))
      const ratio = await videoFaceRatio(tmp)
        .then((r) => r.ratio)
        .catch(() => 0)
      if (ratio > best.ratio) {
        if (best.path) rmSync(best.path, { force: true })
        best = { ratio, path: tmp }
      } else rmSync(tmp, { force: true })
      if (ratio >= MIN_FACE_RATIO) break
    }
    return best.path
  }

  async function makeVideo(id, story, dir, step, look, hero) {
    const sz = sizes[story.ratio]
    const start = pick([0, 2].filter((i) => story.beats[i + 1]))
    const beats = [story.beats[start], story.beats[start + 1]]
    const { who, gender } = hero
    step('Первый кадр ролика')
    const still1 = await withFace(async () => {
      const files = await runWorkflow(
        qwenImageWorkflow({
          prompt: `Cinematic film still: ${beats[0].still}. Subject: ${who}${look ? `, ${look}` : ''}. ${genderClause(gender)} ${onlyOne} ${faceVisible} ${videoStyle}`,
          negative: `${negative}, ${extraPeopleNegative}, ${genderNegative(gender)}`,
          width: sz.still[0],
          height: sz.still[1],
          seed: seed(),
          prefix: `creator/autopost/${id}-s0`,
        }),
      )
      return download(files[0])
    })
    const posterPng = join(dir, 'poster.png')
    writeFileSync(posterPng, still1)
    await toWebp(posterPng, join(dir, 'poster.webp'), 420)
    rmSync(posterPng)
    step('Второй кадр ролика')
    const ref = await uploadImage(still1, `creator-ap-${id}-ref.png`)
    const still2 = await withFace(async () => {
      const files = await runWorkflow(
        qwenEditWorkflow({
          images: [ref],
          prompt: `Cinematic film still: ${beats[1].still}. Subject: the person from the reference photo. ${faceVisible} Keep the face and identity exactly the same as in the reference, do not copy its pose or framing. ${videoStyle}`,
          negative: `${negative}, ${extraPeopleNegative}, ${genderNegative(gender)}`,
          seed: seed(),
          width: sz.still[0],
          height: sz.still[1],
          prefix: `creator/autopost/${id}-s1`,
        }),
      )
      return download(files[0])
    })
    const clips = []
    for (const [i, buf] of [still1, still2].entries()) {
      step(`Видео: сцена ${i + 1} из 2`)
      clips.push(await wanClip(id, `c${i}`, buf, beats[i], sz, join(dir, `clip-${i}`)))
    }
    step('Монтаж и музыка')
    await assembleShots(
      clips,
      join(config.mediaDir, 'music', `${story.id}.mp3`),
      join(dir, 'video.mp4'),
    )
    for (const c of clips) rmSync(c, { force: true })
    return [{ kind: 'video', file: 'video.mp4', thumb: 'poster.webp' }]
  }

  /* ── текст ── */

  function fallbackText(kind, story) {
    if (kind === 'photo')
      return `${story.title} ✨\n\nВ студии новая фотосессия: **${categoryName[story.category] ?? 'тренд'}, свет и ракурсы как у профессионального фотографа** — четыре кадра одного героя.\n\n📸 Чтобы получить такую же со своим лицом, жми на кнопку ниже↓`
    return `${story.title} 🎬\n\n${story.blurb} **Ролик с вами в главной роли** — загрузите фото, остальное студия сделает сама.\n\n🎥 Чтобы снять такой же, жми на кнопку ниже↓`
  }

  /**
   * Сценарий поста от языковой модели: текст анонса и «образ» героя для генерации
   * (одежда и стиль, по-английски). Модель не меняет сюжет — только раскрывает его.
   */
  async function writePlan(kind, story, cfg, hero) {
    const about =
      kind === 'photo'
        ? `Фотосессия «${story.title}» (категория «${categoryName[story.category] ?? story.category}»). Сцена: ${story.scene}. Реквизит и настроение: ${story.props.join(', ')}. В посте 4 кадра одного вымышленного героя: ${hero.gender === 'male' ? 'это мужчина' : 'это женщина'}.`
        : `Видеосюжет «${story.title}»: ${story.blurb} Сцены: ${story.beats.map((b) => b.ru).join(', ')}. Жанр музыки: ${story.genre}, настроение: ${story.mood}. В посте короткий ролик около 10 секунд, в главной роли ${hero.gender === 'male' ? 'мужчина' : 'женщина'}.`
    try {
      const { data: out, model } = await llm.chat(
        [
          {
            role: 'system',
            content:
              'Ты редактор канала AI-фотостудии и арт-директор съёмок: пользователь загружает свои фото и получает профессиональную фотосессию или видео в выбранном сюжете. Анонсы пишешь по-русски, коротко, живо и без канцелярита, как посты популярных фотостудий. Не выдумывай цены, скидки, сроки и обещания. Без хэштегов и ссылок. Отвечаешь только JSON.',
          },
          {
            role: 'user',
            content: `${about}

Верни JSON {"title": "...", "body": "...", "cta": "...", "look": "..."}:
- title: 2–5 слов, образное название сюжета, в конце одно эмодзи;
- body: 1–2 предложения до 260 символов о том, что в кадре и какое настроение; ровно один ключевой фрагмент выдели **жирным**;
- cta: одна строка, начинается с эмодзи (📸 для фото, 🎥 для видео), зовёт создать такую же ${kind === 'photo' ? 'фотосессию' : 'видео'} со своим лицом и заканчивается словами «жми на кнопку ниже↓»;
- look: по-английски, до 25 слов — одежда, причёска и стилинг героя под этот сюжет (без описания лица, возраста и тела, без наготы). Образ строго ${hero.gender === 'male' ? 'мужской: только мужская одежда, никаких платьев, юбок, каблуков, украшений и макияжа' : 'женский'}.\nВ тексте пиши о герое в правильном роде: ${hero.gender === 'male' ? 'он, герой' : 'она, героиня'}.`,
          },
        ],
        { json: true, localModel: cfg.llmModel },
      )
      const clean = (s, max) =>
        String(s ?? '')
          .replace(/[<>]/g, '')
          .replace(/#\S+/g, '')
          .trim()
          .slice(0, max)
      const title = clean(out.title, 60)
      const body = clean(out.body, 400)
      const cta = clean(out.cta, 140)
      if (!title || !body || !cta) throw new Error('пустой ответ модели')
      // Образ попадает в промпт генерации: только простые английские слова, без наготы.
      let look = String(out.look ?? '')
        .replace(/[^A-Za-z0-9 ,.'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
      if (/\b(nude|naked|topless|lingerie|underwear|bikini|sexy|erotic)\b/i.test(look)) look = ''
      // Образ противоположного пола запрещён: женские вещи у мужчины — образ отбрасывается.
      if (hero.gender === 'male' && FEMININE_WEAR.test(look)) look = ''
      return {
        text: [title, body, cta].join('\n\n'),
        look,
        model,
      }
    } catch (error) {
      log(`агент: текст по шаблону (${error.message})`)
      return { text: fallbackText(kind, story), look: '', model: 'шаблон' }
    }
  }

  /* ── запуск и публикация ── */

  function filesOf(row) {
    const dir = join(root, row.id)
    return JSON.parse(row.media).map((m, i) => ({
      kind: m.kind,
      path: join(dir, m.file),
      size: statSync(join(dir, m.file)).size,
      name: `${row.story_id}-${i + 1}.${m.file.split('.').pop()}`,
      type: m.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    }))
  }

  async function publish(id) {
    const row = st.get.get(id)
    const cfg = settings()
    st.status.run('publishing', id)
    try {
      const targets = channels.targetsFor(cfg.channels)
      if (targets.length === 0) throw new Error('Нет каналов, где бот может публиковать')
      const files = filesOf(row)
      const button = row.button ? JSON.parse(row.button) : undefined
      const problems = channels.validate({ text: row.text, button }, files, targets)
      if (problems.length) throw new Error(problems.join('. '))
      const sent = await channels.publishPost({
        authorId: 'autopost',
        text: row.text,
        button,
        files,
        targets,
        label: 'агент',
      })
      const ok = sent.results.some((r) => r.ok)
      st.done.run(
        ok ? 'published' : 'failed',
        JSON.stringify(sent.results),
        ok ? null : 'Ни один канал не принял пост',
        Date.now(),
        id,
      )
    } catch (error) {
      st.fail.run(shortError(error.message), Date.now(), id)
      log(`агент ${id.slice(0, 8)}: ${error.message}`)
    }
  }

  /** Сгенерировать пост; publish=false — оставить черновиком для проверки в админке. */
  async function run({ publish: doPublish, reason }) {
    if (state.running) throw new HttpError(409, 'Агент уже готовит пост')
    const cfg = settings()
    const kind = chooseKind(cfg)
    const story = chooseStory(kind)
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    state.running = id
    st.insert.run(id, kind, story.id, story.title, 'Текст поста', Date.now())
    log(`агент: ${reason} — ${kind} «${story.id}»`)
    const dir = join(root, id)
    mkdirSync(dir, { recursive: true })
    const step = (s) => st.step.run(s, id)
    void (async () => {
      try {
        const hero = pickHero(story)
        const { text, look, model } = await writePlan(kind, story, cfg, hero)
        st.model.run(model, id)
        const media =
          kind === 'photo'
            ? await makePhotos(id, story, dir, step, look, hero)
            : await makeVideo(id, story, dir, step, look, hero)
        const button = cfg.buttonText
          ? {
              text: cfg.buttonText,
              url: `${config.publicUrl}/${kind === 'photo' ? 'photos' : 'video'}/${story.id}`,
            }
          : undefined
        st.ready.run(
          'draft',
          text,
          JSON.stringify(media),
          button ? JSON.stringify(button) : null,
          id,
        )
        if (doPublish) await publish(id)
      } catch (error) {
        st.fail.run(shortError(error.message), Date.now(), id)
        log(`агент ${id.slice(0, 8)}: ${error.message}`)
      } finally {
        state.running = ''
      }
    })()
    return id
  }

  function gc() {
    for (const { id } of st.old.all(Date.now() - KEEP_MEDIA_MS))
      rmSync(join(root, id), { recursive: true, force: true })
    // Папки без записи (например, после ручного удаления черновика).
    for (const name of readdirSync(root))
      if (!st.get.get(name)) rmSync(join(root, name), { recursive: true, force: true })
  }

  function tick() {
    const cfg = settings()
    if (!cfg.enabled || state.running) return
    const last = st.last.get()?.created_at ?? 0
    if (Date.now() < nextRunAt(cfg, last, Date.now())) return
    if (!inWindow(cfg.from, cfg.to, new Date())) return
    // Сначала задачи пользователей: агент ждёт пустую очередь.
    if (q.running.get().n + q.queued.get().n > 0) return
    try {
      gc()
      void run({ publish: cfg.autoPublish, reason: 'расписание' })
    } catch (error) {
      log(`агент: ${error.message}`)
    }
  }

  const view = (row) => {
    const media = JSON.parse(row.media)
    return {
      id: row.id,
      kind: row.kind,
      storyId: row.story_id,
      storyTitle: row.story_title,
      status: row.status,
      step: row.step ?? undefined,
      text: row.text,
      media: media.map((m) => ({
        kind: m.kind,
        src: mediaUrl(row.id, m.file),
        thumb: mediaUrl(row.id, m.thumb),
      })),
      button: row.button ? JSON.parse(row.button) : undefined,
      results: JSON.parse(row.results),
      error: row.error ? shortError(row.error) : undefined,
      model: row.model ?? undefined,
      createdAt: row.created_at,
    }
  }

  function validateSettings(body) {
    const cfg = settings()
    const next = { ...cfg }
    if (body.enabled !== undefined) next.enabled = Boolean(body.enabled)
    if (body.autoPublish !== undefined) next.autoPublish = Boolean(body.autoPublish)
    if (body.intervalMin !== undefined) {
      const n = Number(body.intervalMin)
      if (!Number.isInteger(n) || n < 15 || n > 1440)
        throw new HttpError(400, 'Интервал — от 15 минут до 24 часов')
      next.intervalMin = n
    }
    for (const k of ['from', 'to'])
      if (body[k] !== undefined) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body[k])))
          throw new HttpError(400, 'Время — в формате ЧЧ:ММ')
        next[k] = String(body[k])
      }
    if (body.kinds !== undefined) {
      next.kinds = { photo: Boolean(body.kinds.photo), video: Boolean(body.kinds.video) }
      if (!next.kinds.photo && !next.kinds.video)
        throw new HttpError(400, 'Включите хотя бы фото или видео')
    }
    if (body.channels !== undefined) {
      if (!Array.isArray(body.channels) || body.channels.some((c) => typeof c !== 'string'))
        throw new HttpError(400, 'Каналы — список')
      next.channels = body.channels.slice(0, 20)
    }
    if (body.buttonText !== undefined) {
      const t = String(body.buttonText).trim()
      if (t.length > 64) throw new HttpError(400, 'Текст кнопки — до 64 символов')
      next.buttonText = t
    }
    if (body.llmModel !== undefined) {
      const m = String(body.llmModel).trim()
      if (!/^[\w.:/-]{1,80}$/.test(m)) throw new HttpError(400, 'Неверное имя модели')
      next.llmModel = m
    }
    return next
  }

  function status() {
    const cfg = settings()
    const last = st.last.get()?.created_at ?? 0
    return {
      settings: cfg,
      running: Boolean(state.running),
      nextAt: cfg.enabled ? nextRunAt(cfg, last, Date.now()) : undefined,
      items: st.list.all().map(view),
    }
  }

  return {
    /** Проверка расписания раз в минуту (не запускается в тестах, WORKER=off). */
    start() {
      state.timer = setInterval(tick, 60_000)
      state.timer.unref?.()
    },
    stop() {
      clearInterval(state.timer)
    },
    owns: (path) => path.startsWith('/api/admin/autopost'),

    async handle(req, res, path) {
      const method = req.method
      if (method === 'GET' && path === '/api/admin/autopost') return send(res, 200, status())
      if (method === 'PUT' && path === '/api/admin/autopost') {
        accounts.setSetting('autopost', validateSettings(await readJson(req)))
        return send(res, 200, status())
      }
      if (method === 'POST' && path === '/api/admin/autopost/run') {
        const body = await readJson(req)
        await run({ publish: body.publish === true, reason: 'запуск из админки' })
        return send(res, 202, status())
      }
      const m = /^\/api\/admin\/autopost\/([a-z0-9]{8,20})(\/publish)?$/.exec(path)
      const row = m ? st.get.get(m[1]) : undefined
      if (m && !row) throw new HttpError(404, 'Пост не найден')
      if (m && method === 'POST' && m[2]) {
        if (row.status !== 'draft' && row.status !== 'failed')
          throw new HttpError(409, 'Этот пост уже опубликован или готовится')
        if (JSON.parse(row.media).length === 0)
          throw new HttpError(409, 'У поста нет готовых файлов')
        void publish(row.id)
        return send(res, 202, status())
      }
      if (m && method === 'PATCH' && !m[2]) {
        const body = await readJson(req)
        const text = String(body.text ?? '').trim()
        if (!text || text.length > 1024) throw new HttpError(400, 'Текст — от 1 до 1024 символов')
        if (st.text.run(text, row.id).changes !== 1)
          throw new HttpError(409, 'Править можно только черновик')
        return send(res, 200, status())
      }
      if (m && method === 'DELETE' && !m[2]) {
        if (st.remove.run(row.id).changes !== 1)
          throw new HttpError(409, 'Удалить можно черновик или неудачный пост')
        const dir = join(root, row.id)
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
        return send(res, 200, status())
      }
      throw new HttpError(404, 'Не найдено')
    },
  }
}
