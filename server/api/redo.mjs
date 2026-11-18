/**
 * «Переделать»: ИИ может ошибаться, поэтому у готовой задачи есть одна бесплатная переделка
 * (пока результат не скачан и не прошло 48 часов). Пользователь отмечает, что не так;
 * недорогая модель OpenRouter (рецензент) сравнивает это с журналом генерации — промптами,
 * сидами и оценками проверки лица — и предлагает правки к промптам. Изображения во внешний
 * сервис не уходят: рецензент видит только текст и числа.
 * Отзывы копятся для админки («Качество»): какие шаблоны и почему переделывают.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { HttpError, readJson, send } from './http.mjs'
import { moderate, quickCheck } from './moderation.mjs'
import { applyFixes, planFor, stepsFor } from './presets.mjs'
import { REDO_WINDOW_MS } from './worker.mjs'

export const REASONS = {
  face: 'Лицо не похоже на меня',
  face_cut: 'Лицо обрезано или плохо видно',
  body: 'Искажены руки или тело',
  outfit: 'Не тот образ или одежда',
  scene: 'Не соответствует сюжету',
  quality: 'Размыто или артефакты',
  motion: 'Странное движение в видео',
  audio: 'Не нравится звучание или голос',
  other: 'Другое',
}

/** Недорогие платные модели-рецензенты по умолчанию (цена за 1М токенов ≈ $0.1). */
export const DEFAULT_REVIEW_MODELS = 'deepseek/deepseek-v4-flash, google/gemini-2.5-flash-lite'

const en = (s, max) =>
  String(s ?? '')
    .replace(/[^A-Za-z0-9 ,.'():;-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

export function redoModule({ db, q, accounts, llm, config, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_feedback (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      redo_job_id TEXT,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      reasons TEXT NOT NULL,
      comment TEXT,
      frames TEXT,
      diagnosis TEXT,
      notes TEXT,
      fixes TEXT,
      model TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS job_feedback_created ON job_feedback (created_at);
  `)
  const st = {
    insert: db.prepare(
      `INSERT INTO job_feedback (id, job_id, redo_job_id, user_id, kind, target, reasons, comment, frames, diagnosis, notes, fixes, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    byRedo: db.prepare('SELECT diagnosis FROM job_feedback WHERE redo_job_id = ?'),
    list: db.prepare('SELECT * FROM job_feedback ORDER BY created_at DESC LIMIT 100'),
    insertJob: db.prepare(
      `INSERT INTO jobs (id, token_hash, kind, target, options, photos, status, total, client, created_at)
       VALUES (?, '-', ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    ),
    owner: db.prepare('UPDATE jobs SET user_id = ?, cost = 0 WHERE id = ?'),
  }

  function canRedo(job) {
    if (job.status !== 'done' || job.downloaded || job.redo_used || job.redo_of) return false
    if (!job.finished_at || Date.now() - job.finished_at > REDO_WINDOW_MS) return false
    // Нужны исходные фото (у песни их нет).
    return job.kind === 'song' || existsSync(join(config.uploadDir, job.id))
  }

  const reviewModels = () =>
    String(accounts.getSetting('integrations').openrouter?.reviewModel || DEFAULT_REVIEW_MODELS)
      .split(/[\s,]+/)
      .filter((m) => /^[\w.-]+\/[\w.:-]+$/.test(m))
      .slice(0, 4)

  /** Рецензент: журнал генерации + жалоба → диагноз для пользователя и правки к промптам. */
  async function review(job, reasons, comment, frames) {
    const trace = JSON.parse(job.trace ?? '[]')
    const prompt = {
      kind: job.kind,
      template: job.target,
      userReasons: reasons.map((r) => REASONS[r]),
      userComment: comment || undefined,
      framesToRedo: frames?.length ? frames.map((i) => i + 1) : 'all',
      generationLog: trace.slice(0, 12),
    }
    try {
      const { data, model } = await llm.chat(
        [
          {
            role: 'system',
            content: `Ты инженер качества AI-фотостудии. Генерация: Qwen-Image-Edit (кадр по фото пользователя) и Wan 2.2 (видео из кадра), песни — ACE-Step. Тебе дают журнал генерации (промпты, сиды; similarity — сходство лица с фото пользователя по SFace 0..1, ниже 0.5 — плохо; faceVisible/faceInFrame — лицо целиком в кадре; samePerson — доля кадров видео с тем же человеком) и жалобу пользователя. Найди вероятную причину и предложи правки, не меняя сюжет. Правки — короткие английские добавки к промпту и негативу, без имён реальных людей, без наготы и откровенности. Одежда — по полу человека на фото.
Ответ только JSON: {"diagnosis": "1–2 предложения по-русски для пользователя: что пошло не так и что исправим", "notes": "1–2 предложения по-русски для администратора: что улучшить в шаблоне", "strict_identity": true|false, "negative": "общие английские добавки к негативу или пусто", "shots": [{"index": номер кадра или сцены с 1, "add": "английская добавка к промпту до 35 слов", "negative": "английская добавка к негативу до 15 слов", "motion": "для видео: добавка к описанию движения или пусто"}]}`,
          },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
        { json: true, paid: reviewModels(), localModel: accounts.getSetting('autopost')?.llmModel },
      )
      const shots = {}
      for (const s of Array.isArray(data.shots) ? data.shots.slice(0, 8) : []) {
        const i = Number(s?.index) - 1
        if (!Number.isInteger(i) || i < 0 || i > 7) continue
        shots[i] = {
          add: en(s.add, 260) || undefined,
          negative: en(s.negative, 140) || undefined,
          motion: en(s.motion, 180) || undefined,
        }
      }
      const fixes = {
        strict: Boolean(data.strict_identity) || reasons.includes('face'),
        negative: en(data.negative, 160) || undefined,
        shots,
      }
      // Правки попадают в промпт — проверяем их тем же фильтром, что и пользовательский текст.
      if (!quickCheck(JSON.stringify(fixes)).ok) throw new Error('правки не прошли фильтр')
      return {
        diagnosis: String(data.diagnosis ?? '')
          .replace(/[<>]/g, '')
          .slice(0, 400),
        notes: String(data.notes ?? '')
          .replace(/[<>]/g, '')
          .slice(0, 400),
        fixes,
        model,
      }
    } catch (error) {
      log(`переделка: рецензент недоступен (${error.message}), правки по правилам`)
      return { ...ruleFixes(reasons), model: 'правила' }
    }
  }

  /** Запасные правки без модели: по отмеченным причинам. */
  function ruleFixes(reasons) {
    const add = []
    const negative = []
    if (reasons.includes('face_cut'))
      add.push('the whole head and face fully inside the frame, centered, medium shot')
    if (reasons.includes('body')) {
      add.push('natural relaxed hands, anatomically correct body proportions')
      negative.push('extra fingers, deformed hands, twisted limbs')
    }
    if (reasons.includes('quality')) add.push('sharp focus, high detail, clean image')
    if (reasons.includes('outfit'))
      add.push('clothing exactly matches the scenario and the gender of the person')
    if (reasons.includes('motion')) negative.push('jerky motion, morphing, sudden cuts')
    const text = add.join(', ')
    const shots = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [i, { add: text || undefined }]),
    )
    return {
      diagnosis: reasons.includes('face')
        ? 'Пересоздадим кадры со строгой проверкой сходства лица и новыми вариантами.'
        : 'Пересоздадим с исправлениями по вашим замечаниям и новыми вариантами кадров.',
      notes: '',
      fixes: {
        strict: reasons.includes('face'),
        negative: negative.join(', ') || undefined,
        shots,
      },
    }
  }

  async function redo(req, res, user, job) {
    if (job.user_id !== user.id) throw new HttpError(404, 'Задача не найдена')
    if (!canRedo(job))
      throw new HttpError(
        409,
        job.downloaded
          ? 'Результат уже скачан — переделка недоступна'
          : 'Переделка недоступна: она уже использована или прошло больше 48 часов',
      )
    const body = await readJson(req)
    const reasons = (Array.isArray(body.reasons) ? body.reasons : []).filter((r) =>
      Object.hasOwn(REASONS, r),
    )
    if (!reasons.length) throw new HttpError(400, 'Отметьте, что не так')
    const comment = String(body.comment ?? '')
      .trim()
      .slice(0, 500)
    if (comment) {
      const verdict = await moderate(llm, comment, {
        localModel: accounts.getSetting('autopost')?.llmModel,
      })
      if (!verdict.ok) throw new HttpError(422, verdict.message)
    }
    const results = JSON.parse(job.results)
    const frames =
      job.kind === 'photo'
        ? [...new Set((Array.isArray(body.frames) ? body.frames : []).map(Number))].filter(
            (i) => Number.isInteger(i) && i >= 0 && i < results.length,
          )
        : []
    const options = JSON.parse(job.options)
    const plan = planFor(job.kind, job.target, options)
    if (!plan) throw new HttpError(404, 'Сценарий больше недоступен')

    // Флаг ставится до долгого запроса к рецензенту: вторая переделка параллельно невозможна.
    if (q.useRedo.run(job.id).changes !== 1) throw new HttpError(409, 'Переделка уже запущена')
    try {
      return await start(res, user, job, { reasons, comment, frames, options, plan })
    } catch (error) {
      // Не удалось запустить — переделка остаётся доступной.
      db.prepare('UPDATE jobs SET redo_used = 0 WHERE id = ?').run(job.id)
      throw error
    }
  }

  async function start(res, user, job, { reasons, comment, frames, options, plan }) {
    const verdict = await review(job, reasons, comment, frames)
    const fixes = { ...verdict.fixes, frames, seedShift: 50_000 + Math.floor(Math.random() * 9000) }

    const id = randomBytes(16).toString('hex')
    if (job.kind !== 'song') {
      mkdirSync(join(config.uploadDir, id), { recursive: true })
      cpSync(join(config.uploadDir, job.id), join(config.uploadDir, id), { recursive: true })
    }
    const next = { ...options, fixes, redoOf: job.id }
    st.insertJob.run(
      id,
      job.kind,
      job.target,
      JSON.stringify(next),
      job.photos,
      stepsFor(job.kind, applyFixes(job.kind, plan, fixes)),
      user.id,
      Date.now(),
    )
    st.owner.run(user.id, id)
    q.setRedoOf.run(job.id, id)
    st.insert.run(
      randomBytes(8).toString('hex'),
      job.id,
      id,
      user.id,
      job.kind,
      job.target,
      JSON.stringify(reasons),
      comment || null,
      JSON.stringify(frames),
      verdict.diagnosis,
      verdict.notes,
      JSON.stringify(fixes),
      verdict.model,
      Date.now(),
    )
    log(
      `переделка ${job.id.slice(0, 8)} → ${id.slice(0, 8)}: ${reasons.join(',')} (${verdict.model})`,
    )
    return send(res, 201, { id, diagnosis: verdict.diagnosis })
  }

  return {
    canRedo,
    /** Что исправили — для страницы задачи-переделки. */
    noteFor: (jobId) => st.byRedo.get(jobId)?.diagnosis ?? undefined,
    redo,
    downloaded(job) {
      if (q.markDownloaded.run(job.id).changes && !job.downloaded)
        log(`задача ${job.id.slice(0, 8)}: скачана, переделка закрыта`)
    },
    /** Админка «Качество»: отзывы и что чаще всего переделывают. */
    feedback() {
      const rows = st.list.all().map((r) => ({
        id: r.id,
        jobId: r.job_id,
        redoJobId: r.redo_job_id ?? undefined,
        kind: r.kind,
        target: r.target,
        reasons: JSON.parse(r.reasons),
        comment: r.comment ?? undefined,
        frames: JSON.parse(r.frames ?? '[]'),
        diagnosis: r.diagnosis ?? undefined,
        notes: r.notes ?? undefined,
        model: r.model ?? undefined,
        createdAt: r.created_at,
      }))
      const count = (key) => {
        const map = new Map()
        for (const r of rows) for (const k of [r[key]].flat()) map.set(k, (map.get(k) ?? 0) + 1)
        return [...map].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
      }
      return {
        items: rows,
        byReason: count('reasons'),
        byTarget: count('target'),
        reasons: REASONS,
      }
    },
  }
}
