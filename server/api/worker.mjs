/**
 * Воркер очереди: по одной задаче за раз (один GPU). Задачи пользователей ставятся в начало
 * очереди ComfyUI, поэтому фабрика образцов их не задерживает.
 */
import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  download,
  aceMusicWorkflow,
  qwenEditWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from '../factory/comfy.mjs'
import { assembleShots, encode } from '../factory/assemble.mjs'
import {
  faceCrop,
  imageIdentity,
  MIN_FACE_RATIO,
  MIN_PAIR_RATIO,
  SAME_PERSON,
  videoFaceRatio,
} from '../factory/faces.mjs'
import { toJpeg, toWebp } from './images.mjs'
import { applyFixes, negative, planFor } from './presets.mjs'

const run = promisify(execFile)

class Cancelled extends Error {}

const now = () => Date.now()

/** Цель по сходству лица (SFace): ниже — кадр пересоздаётся (порог «тот же человек» 0.363). */
const GOOD_LIKENESS = Math.max(SAME_PERSON, Number(process.env.GOOD_LIKENESS ?? 0.5))
/** При переделке с жалобой на лицо — строже: выше порог сходства и больше попыток. */
const STRICT_LIKENESS = Math.max(GOOD_LIKENESS, 0.6)
/** Фото пользователя хранятся для переделки двое суток после готовности задачи. */
export const REDO_WINDOW_MS = 48 * 3_600_000
/** Доля кадров ролика, где лицо — тот же человек, что на фото. */
const MIN_SAME_RATIO = 0.8
const cropHint =
  " The second reference image is a close-up of the same person's face: reproduce exactly this face — eye shape, nose, lips, jawline, eyebrows, skin tone and hairline."

async function withRetry(fn, attempts = 2) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      last = error
      await new Promise((r) => setTimeout(r, 5_000))
    }
  }
  throw last
}

export function startWorker({ q, config, log, onFinish = () => {} }) {
  let busy = false

  q.requeueRunning.run()

  /** Журнал генерации: промпты, сиды и оценки проверки по каждой попытке (для переделки). */
  const traces = new Map()
  const trace = (job, entry) => traces.get(job.id)?.push(entry)

  function checkCancel(id) {
    if (q.get.get(id)?.cancel_requested) throw new Cancelled()
  }

  /** Временные файлы ComfyUI задачи. */
  function cleanupComfy(id) {
    // Копии в ComfyUI: входы и промежуточные PNG этой задачи.
    for (const [sub, prefix] of [
      ['input', `creator-u-${id}`],
      ['output/creator-user', id],
    ]) {
      const dir = join(config.comfyData, sub)
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        if (name.startsWith(prefix)) rmSync(join(dir, name), { force: true })
      }
    }
  }
  /** Фото пользователя и временные файлы задачи. */
  function cleanupInputs(id) {
    rmSync(join(config.uploadDir, id), { recursive: true, force: true })
    cleanupComfy(id)
  }

  /**
   * Референсы для модели: фото пользователя и, для одного героя, крупный план его лица —
   * так модель видит черты лица в высоком разрешении (замер SFace: сходство выше на ~0.1).
   * refs — исходные фото для сравнения лиц на готовых кадрах.
   */
  async function prepareRefs(job, people = 1) {
    const refs = []
    for (let i = 0; i < job.photos; i++)
      refs.push(readFileSync(join(config.uploadDir, job.id, `${i}.png`)))
    const images = []
    for (const [i, buf] of refs.entries())
      images.push(await uploadImage(buf, `creator-u-${job.id}-${i}.png`))
    let crop
    if (people === 1) crop = await faceCrop(refs[0]).catch(() => undefined)
    if (crop) {
      // Модель принимает до трёх изображений: первое фото, крупный план лица, второе фото.
      images.splice(1, 0, await uploadImage(crop, `creator-u-${job.id}-face.png`))
    }
    return { images: images.slice(0, 3), refs, hint: crop ? cropHint : '' }
  }

  async function edit(job, ref, shot, index, upscale) {
    const files = await withRetry(() =>
      runWorkflow(
        qwenEditWorkflow({
          images: ref.images,
          prompt: shot.prompt + ref.hint,
          negative: shot.negativeExtra ? `${negative}, ${shot.negativeExtra}` : negative,
          seed: shot.seed,
          width: shot.width,
          height: shot.height,
          prefix: `creator-user/${job.id}-${index}`,
          upscale,
        }),
        { front: true, timeoutMs: 900_000 },
      ),
    )
    return download(files[0])
  }

  /** Проверка качества не должна ронять задачу: если детектор недоступен, кадр принимается. */
  async function identity(buffer, refs, minFaces = 1) {
    try {
      return await imageIdentity(buffer, refs, minFaces)
    } catch (error) {
      log(`проверка лица недоступна: ${error.message}`)
      return { ok: true, similarity: 1 }
    }
  }

  async function clipIdentity(file, refs, minFaces = 1) {
    try {
      return await videoFaceRatio(file, minFaces, refs)
    } catch (error) {
      log(`проверка лица недоступна: ${error.message}`)
      return { ratio: 1, sameRatio: 1, similarity: 1 }
    }
  }

  /**
   * Кадр, где лицо видно целиком и это тот же человек, что на фото: до трёх попыток с разными
   * сидами, иначе — самый похожий из удачных по композиции.
   */
  async function editWithFace(job, ref, shot, index, upscale, minFaces = 1) {
    let best = { score: -Infinity, buf: undefined }
    const goal = shot.strict ? STRICT_LIKENESS : GOOD_LIKENESS
    const record = {
      type: 'frame',
      index,
      prompt: shot.prompt,
      negative: shot.negativeExtra || undefined,
      attempts: [],
    }
    trace(job, record)
    for (let attempt = 0; attempt < (shot.strict ? 4 : 3); attempt++) {
      checkCancel(job.id)
      const buf = await edit(
        job,
        ref,
        { ...shot, seed: shot.seed + attempt * 1009 },
        index,
        upscale,
      )
      const id = await identity(buf, ref.refs, minFaces)
      const similarity = id.similarity ?? (id.ok ? 1 : 0)
      const score = (id.ok ? 1 : 0) + similarity
      record.attempts.push({
        seed: shot.seed + attempt * 1009,
        faceVisible: Boolean(id.ok),
        similarity: Number(similarity.toFixed(3)),
        reason: id.ok ? undefined : id.reason,
      })
      if (score > best.score) best = { score, buf }
      if (id.ok && similarity >= goal) return buf
      log(
        `задача ${job.id.slice(0, 8)}: кадр ${index + 1} ${id.ok ? '' : 'без лица целиком, '}сходство ${similarity.toFixed(2)}, попытка ${attempt + 2}`,
      )
    }
    return best.buf
  }

  /** Клип, где лицо видно и остаётся тем же человеком хотя бы в 80% кадров: до трёх попыток. */
  async function clipWithFace(job, imageBuf, tag, clip, width, height, file, refs, minFaces = 1) {
    let best = { score: -1, path: '' }
    const need = minFaces > 1 ? MIN_PAIR_RATIO : MIN_FACE_RATIO
    const record = { type: 'clip', tag, prompt: clip.prompt, attempts: [] }
    trace(job, record)
    for (let attempt = 0; attempt < 3; attempt++) {
      checkCancel(job.id)
      const path = `${file}.try${attempt}.mp4`
      await wanClip(
        job,
        imageBuf,
        `${tag}t${attempt}`,
        { ...clip, seed: clip.seed + attempt * 7919 },
        width,
        height,
        path,
      )
      const r = await clipIdentity(path, refs, minFaces)
      record.attempts.push({
        seed: clip.seed + attempt * 7919,
        faceInFrame: Number(r.ratio.toFixed(2)),
        samePerson: Number(r.sameRatio.toFixed(2)),
        similarity: Number((r.similarity ?? 0).toFixed(3)),
      })
      const score = r.ratio + r.sameRatio
      if (score > best.score) {
        if (best.path) rmSync(best.path, { force: true })
        best = { score, path }
      } else {
        rmSync(path, { force: true })
      }
      if (r.ratio >= need && r.sameRatio >= MIN_SAME_RATIO) break
      log(
        `задача ${job.id.slice(0, 8)}: клип ${tag} лицо в ${Math.round(r.ratio * 100)}% кадров, тот же человек в ${Math.round(r.sameRatio * 100)}%, пересъёмка`,
      )
    }
    renameSync(best.path, file)
  }

  async function photoJob(job, plan, out) {
    const ref = await prepareRefs(job)
    const results = []
    for (const [i, shot] of plan.entries()) {
      checkCancel(job.id)
      const png = join(out, `${i + 1}.png`)
      writeFileSync(png, await editWithFace(job, ref, shot, i, 'RealESRGAN_x2plus.pth'))
      await toJpeg(png, join(out, `${i + 1}.jpg`))
      await toWebp(png, join(out, `${i + 1}.webp`), 720)
      rmSync(png)
      results.push({
        type: 'photo',
        src: `/media/jobs/${job.id}/${i + 1}.webp`,
        download: `/media/jobs/${job.id}/${i + 1}.jpg`,
        label: shot.name,
        // В JPEG для скачивания — апскейл ×2.
        width: shot.width * 2,
        height: shot.height * 2,
      })
      q.progress.run(i + 1, JSON.stringify(results), job.id)
    }
    return results
  }

  const videoNegative =
    'blurry, distorted face, changing face, face morphing, different person, changing identity, hands covering the face, extra limbs, extra fingers, static, jitter, flicker, watermark, text, morphing'
  async function ffmpeg(args) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300_000 })
  }

  /** Клип Wan 2.2 из картинки, 81 кадр ≈ 5 с. */
  async function wanClip(job, imageBuf, tag, clip, width, height, file) {
    const image = await uploadImage(imageBuf, `creator-u-${job.id}-${tag}.png`)
    const files = await withRetry(() =>
      runWorkflow(
        wanVideoWorkflow({
          image,
          prompt: clip.prompt,
          negative: videoNegative,
          width,
          height,
          seed: clip.seed,
          prefix: `creator-user/${job.id}-${tag}`,
          finish: true,
        }),
        { front: true, timeoutMs: 1_800_000 },
      ),
    )
    writeFileSync(file, await download(files[0]))
  }

  function videoResult(job, width, height, label) {
    return [
      {
        type: 'video',
        src: `/media/jobs/${job.id}/video.mp4`,
        download: `/media/jobs/${job.id}/video.mp4`,
        poster: `/media/jobs/${job.id}/poster.webp`,
        label,
        // Real-ESRGAN ×2 внутри процесса Wan.
        width: width * 2,
        height: height * 2,
      },
    ]
  }

  /** Видеошаблон: четыре плана (кадр → клип), склейка с переходами и музыкой ≈ 19 с. */
  async function videoJob(job, plan, out) {
    const ref = await prepareRefs(job, plan.people)
    const clips = []
    let step = 0
    for (const [i, shot] of plan.shots.entries()) {
      checkCancel(job.id)
      const still = join(out, `still-${i}.png`)
      writeFileSync(still, await editWithFace(job, ref, shot.still, i, undefined, plan.people))
      if (i === 0) await toWebp(still, join(out, 'poster.webp'), 720)
      q.progress.run(++step, '[]', job.id)
      checkCancel(job.id)
      const clip = join(out, `clip-${i}.mp4`)
      await clipWithFace(
        job,
        readFileSync(still),
        `s${i}`,
        shot.video,
        shot.video.width,
        shot.video.height,
        clip,
        ref.refs,
        plan.people,
      )
      rmSync(still)
      clips.push(clip)
      q.progress.run(++step, '[]', job.id)
    }
    checkCancel(job.id)

    // Свой сюжет: музыка по согласованному описанию (или без музыки); шаблон — готовый трек.
    let music = join(config.mediaDir, 'music', `${job.target}.mp3`)
    if (plan.custom) {
      music = plan.music
        ? await makeMusic(job, plan.music, join(out, 'music.mp3'), clips.length * 5 + 2)
        : ''
      if (plan.music) q.progress.run(++step, '[]', job.id)
    }
    const { total } = await assembleShots(clips, music, join(out, 'video.mp4'))
    if (plan.custom && music) rmSync(music, { force: true })
    for (const c of clips) rmSync(c)
    const first = plan.shots[0].video
    const results = videoResult(job, first.width, first.height, `${Math.round(total)} с`)
    q.progress.run(++step, JSON.stringify(results), job.id)
    return results
  }

  /** Инструментальная музыка ACE-Step по описанию (свой видеосюжет). */
  async function makeMusic(job, music, file, seconds) {
    const files = await withRetry(() =>
      runWorkflow(
        aceMusicWorkflow({
          tags: `${music.tags}, instrumental, no vocals`,
          bpm: music.bpm,
          seconds,
          keyscale: 'C major',
          seed: 4242,
          prefix: `creator-user/${job.id}-music`,
        }),
        { front: true, timeoutMs: 600_000 },
      ),
    )
    writeFileSync(file, await download(files[0]))
    return file
  }

  /** Песня с вокалом: текст и звучание согласованы с агентом. */
  async function songJob(job, plan, out) {
    const files = await withRetry(() =>
      runWorkflow(
        aceMusicWorkflow({
          tags: `${plan.tags}, ${plan.vocal === 'male' ? 'male vocals' : 'female vocals'}, clear vocals, professional mix`,
          lyrics: plan.lyrics,
          language: plan.language,
          bpm: plan.bpm,
          seconds: plan.seconds,
          keyscale: 'C major',
          seed: Number.parseInt(job.id.slice(0, 6), 16) + (plan.seedShift ?? 0),
          prefix: `creator-user/${job.id}-song`,
        }),
        { front: true, timeoutMs: 900_000 },
      ),
    )
    writeFileSync(join(out, 'song.mp3'), await download(files[0]))
    const results = [
      {
        type: 'audio',
        src: `/media/jobs/${job.id}/song.mp3`,
        download: `/media/jobs/${job.id}/song.mp3`,
        label: plan.title,
        text: plan.lyrics,
        width: 0,
        height: 0,
      },
    ]
    q.progress.run(1, JSON.stringify(results), job.id)
    return results
  }

  /** «Оживить фото»: клипы Wan из снимка пользователя, для 10 с второй продолжает первый. */
  async function animateJob(job, plan, out) {
    const source = join(config.uploadDir, job.id, '0.png')
    await toWebp(source, join(out, 'poster.webp'), 720)
    const parts = []
    let image = readFileSync(source)
    // Если на исходном фото есть лицо, оно должно остаться в кадре и в ролике.
    const refs = [image]
    const withFace = (await identity(image, [])).ok
    for (const [i, clip] of plan.clips.entries()) {
      checkCancel(job.id)
      const file = join(out, `part-${i}.mp4`)
      if (withFace)
        await clipWithFace(job, image, `a${i}`, clip, plan.width, plan.height, file, refs)
      else await wanClip(job, image, `a${i}`, clip, plan.width, plan.height, file)
      parts.push(file)
      if (i < plan.clips.length - 1) {
        const frame = join(out, `last-${i}.png`)
        await ffmpeg(['-sseof', '-0.1', '-i', file, '-frames:v', '1', '-update', '1', frame])
        image = readFileSync(frame)
        rmSync(frame)
      }
      q.progress.run(i + 1, '[]', job.id)
    }
    const final = join(out, 'video.mp4')
    if (parts.length === 1) {
      await ffmpeg(['-i', parts[0], '-vf', 'format=yuv420p', ...encode, '-an', final])
    } else {
      // Первый кадр продолжения совпадает с последним кадром первой части — убираем повтор.
      const inputs = parts.flatMap((p) => ['-i', p])
      const filter = [
        ...parts
          .slice(1)
          .map((_, k) => `[${k + 1}:v]trim=start_frame=1,setpts=PTS-STARTPTS[t${k + 1}]`),
        `[0:v]${parts
          .slice(1)
          .map((_, k) => `[t${k + 1}]`)
          .join('')}concat=n=${parts.length}:v=1:a=0[c]`,
        '[c]format=yuv420p[v]',
      ].join(';')
      await ffmpeg([...inputs, '-filter_complex', filter, '-map', '[v]', ...encode, '-an', final])
    }
    for (const p of parts) rmSync(p)
    const results = videoResult(job, plan.width, plan.height, `${plan.clips.length * 5} с`)
    q.progress.run(plan.clips.length, JSON.stringify(results), job.id)
    return results
  }

  /** Возврат токенов и бонусы не должны ронять воркер. */
  function safeFinish(job, status) {
    try {
      onFinish(job, status)
    } catch (error) {
      log(`итог задачи ${job.id.slice(0, 8)}: ${error.message}`)
    }
  }

  async function runJob(job) {
    busy = true
    const started = now()
    q.start.run(started, job.id)
    const out = join(config.mediaDir, 'jobs', job.id)
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    log(`задача ${job.id.slice(0, 8)} (${job.kind}/${job.target}) начата`)
    try {
      const options = JSON.parse(job.options)
      const plan = applyFixes(job.kind, planFor(job.kind, job.target, options), options.fixes)
      if (!plan) throw new Error('План задачи не найден')
      traces.set(job.id, [])
      if (job.kind === 'song')
        trace(job, {
          type: 'song',
          tags: plan.tags,
          bpm: plan.bpm,
          language: plan.language,
          vocal: plan.vocal,
        })
      const make =
        job.kind === 'video'
          ? videoJob
          : job.kind === 'animate'
            ? animateJob
            : job.kind === 'song'
              ? songJob
              : photoJob
      const results = await make(job, plan, out)
      q.finish.run('done', null, now(), JSON.stringify(results), job.id)
      safeFinish(job, 'done')
      log(`задача ${job.id.slice(0, 8)} готова за ${Math.round((now() - started) / 1000)} с`)
    } catch (error) {
      if (error instanceof Cancelled) {
        rmSync(out, { recursive: true, force: true })
        q.finish.run('cancelled', null, now(), '[]', job.id)
        safeFinish(job, 'cancelled')
        log(`задача ${job.id.slice(0, 8)} отменена`)
      } else {
        rmSync(out, { recursive: true, force: true })
        q.finish.run(
          'failed',
          'Не удалось создать результат. Попробуйте ещё раз или выберите другие фото.',
          now(),
          '[]',
          job.id,
        )
        safeFinish(job, 'failed')
        log(`задача ${job.id.slice(0, 8)} ошибка: ${error.message}`)
      }
    } finally {
      q.saveTrace.run(JSON.stringify(traces.get(job.id) ?? []), job.id)
      traces.delete(job.id)
      // Фото готовой задачи остаются для переделки (окно 48 ч или до скачивания); остальное — сразу.
      if (q.get.get(job.id)?.status === 'done') cleanupComfy(job.id)
      else cleanupInputs(job.id)
      busy = false
    }
  }

  function expire() {
    for (const { id } of q.inputsExpired.all(now() - REDO_WINDOW_MS, now() - 14 * 86_400_000))
      rmSync(join(config.uploadDir, id), { recursive: true, force: true })
    const border = now() - config.keepResultsMs
    for (const { id } of q.expired.all(border)) {
      rmSync(join(config.mediaDir, 'jobs', id), { recursive: true, force: true })
      cleanupInputs(id)
      q.expire.run(id)
    }
  }

  const tick = setInterval(() => {
    if (busy) return
    const job = q.next.get()
    if (job) void runJob(job)
  }, 1_500)
  const sweep = setInterval(expire, 3_600_000)
  expire()

  return {
    cleanupInputs,
    isBusy: () => busy,
    stop: () => {
      clearInterval(tick)
      clearInterval(sweep)
    },
  }
}
