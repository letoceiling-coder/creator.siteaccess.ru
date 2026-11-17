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
  qwenEditWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from '../factory/comfy.mjs'
import { assembleShots, encode } from '../factory/assemble.mjs'
import { imageHasFace, MIN_FACE_RATIO, MIN_PAIR_RATIO, videoFaceRatio } from '../factory/faces.mjs'
import { toJpeg, toWebp } from './images.mjs'
import { negative, planFor } from './presets.mjs'

const run = promisify(execFile)

class Cancelled extends Error {}

const now = () => Date.now()

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

export function startWorker({ q, config, log }) {
  let busy = false

  q.requeueRunning.run()

  function checkCancel(id) {
    if (q.get.get(id)?.cancel_requested) throw new Cancelled()
  }

  function cleanupInputs(id) {
    rmSync(join(config.uploadDir, id), { recursive: true, force: true })
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

  async function uploadPhotos(job) {
    const names = []
    for (let i = 0; i < job.photos; i++) {
      const buf = readFileSync(join(config.uploadDir, job.id, `${i}.png`))
      names.push(await uploadImage(buf, `creator-u-${job.id}-${i}.png`))
    }
    return names
  }

  async function edit(job, images, shot, index, upscale) {
    const files = await withRetry(() =>
      runWorkflow(
        qwenEditWorkflow({
          images,
          prompt: shot.prompt,
          negative,
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
  async function faceOk(buffer, minFaces = 1) {
    try {
      return (await imageHasFace(buffer, minFaces)).ok
    } catch (error) {
      log(`проверка лица недоступна: ${error.message}`)
      return true
    }
  }

  async function faceRatio(file, minFaces = 1) {
    try {
      return (await videoFaceRatio(file, minFaces)).ratio
    } catch (error) {
      log(`проверка лица недоступна: ${error.message}`)
      return 1
    }
  }

  /** Кадр, где лицо видно целиком: до трёх попыток с разными сидами. */
  async function editWithFace(job, images, shot, index, upscale, minFaces = 1) {
    let first
    for (let attempt = 0; attempt < 3; attempt++) {
      checkCancel(job.id)
      const buf = await edit(
        job,
        images,
        { ...shot, seed: shot.seed + attempt * 1009 },
        index,
        upscale,
      )
      first ??= buf
      if (await faceOk(buf, minFaces)) return buf
      log(`задача ${job.id.slice(0, 8)}: кадр ${index + 1} без лица, попытка ${attempt + 2}`)
    }
    return first
  }

  /** Клип, где лицо видно хотя бы в 80% кадров: до трёх попыток, иначе лучший. */
  async function clipWithFace(job, imageBuf, tag, clip, width, height, file, minFaces = 1) {
    let best = { ratio: -1, path: '' }
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
      const ratio = await faceRatio(path, minFaces)
      if (ratio > best.ratio) {
        if (best.path) rmSync(best.path, { force: true })
        best = { ratio, path }
      } else {
        rmSync(path, { force: true })
      }
      if (ratio >= (minFaces > 1 ? MIN_PAIR_RATIO : MIN_FACE_RATIO)) break
      log(
        `задача ${job.id.slice(0, 8)}: клип ${tag} лицо в ${Math.round(ratio * 100)}% кадров, пересъёмка`,
      )
    }
    renameSync(best.path, file)
  }

  async function photoJob(job, plan, out) {
    const images = await uploadPhotos(job)
    const results = []
    for (const [i, shot] of plan.entries()) {
      checkCancel(job.id)
      const png = join(out, `${i + 1}.png`)
      writeFileSync(png, await editWithFace(job, images, shot, i, 'RealESRGAN_x2plus.pth'))
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
    'blurry, distorted face, changing face, hands covering the face, extra limbs, extra fingers, static, jitter, flicker, watermark, text, morphing'
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
    const images = await uploadPhotos(job)
    const clips = []
    let step = 0
    for (const [i, shot] of plan.shots.entries()) {
      checkCancel(job.id)
      const still = join(out, `still-${i}.png`)
      writeFileSync(still, await editWithFace(job, images, shot.still, i, undefined, plan.people))
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
        plan.people,
      )
      rmSync(still)
      clips.push(clip)
      q.progress.run(++step, '[]', job.id)
    }
    checkCancel(job.id)

    const music = join(config.mediaDir, 'music', `${job.target}.mp3`)
    const { total } = await assembleShots(clips, music, join(out, 'video.mp4'))
    for (const c of clips) rmSync(c)
    const first = plan.shots[0].video
    const results = videoResult(job, first.width, first.height, `${Math.round(total)} с`)
    q.progress.run(++step, JSON.stringify(results), job.id)
    return results
  }

  /** «Оживить фото»: клипы Wan из снимка пользователя, для 10 с второй продолжает первый. */
  async function animateJob(job, plan, out) {
    const source = join(config.uploadDir, job.id, '0.png')
    await toWebp(source, join(out, 'poster.webp'), 720)
    const parts = []
    let image = readFileSync(source)
    // Если на исходном фото есть лицо, оно должно остаться в кадре и в ролике.
    const withFace = await faceOk(image)
    for (const [i, clip] of plan.clips.entries()) {
      checkCancel(job.id)
      const file = join(out, `part-${i}.mp4`)
      if (withFace) await clipWithFace(job, image, `a${i}`, clip, plan.width, plan.height, file)
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

  async function runJob(job) {
    busy = true
    const started = now()
    q.start.run(started, job.id)
    const out = join(config.mediaDir, 'jobs', job.id)
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    log(`задача ${job.id.slice(0, 8)} (${job.kind}/${job.target}) начата`)
    try {
      const plan = planFor(job.kind, job.target, JSON.parse(job.options))
      if (!plan) throw new Error('План задачи не найден')
      const make = job.kind === 'video' ? videoJob : job.kind === 'animate' ? animateJob : photoJob
      const results = await make(job, plan, out)
      q.finish.run('done', null, now(), JSON.stringify(results), job.id)
      log(`задача ${job.id.slice(0, 8)} готова за ${Math.round((now() - started) / 1000)} с`)
    } catch (error) {
      if (error instanceof Cancelled) {
        rmSync(out, { recursive: true, force: true })
        q.finish.run('cancelled', null, now(), '[]', job.id)
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
        log(`задача ${job.id.slice(0, 8)} ошибка: ${error.message}`)
      }
    } finally {
      cleanupInputs(job.id)
      busy = false
    }
  }

  function expire() {
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
