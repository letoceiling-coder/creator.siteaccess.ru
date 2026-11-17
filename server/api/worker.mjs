/**
 * Воркер очереди: по одной задаче за раз (один GPU). Задачи пользователей ставятся в начало
 * очереди ComfyUI, поэтому фабрика образцов их не задерживает.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  download,
  qwenEditWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from '../factory/comfy.mjs'
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

  async function photoJob(job, plan, out) {
    const images = await uploadPhotos(job)
    const results = []
    for (const [i, shot] of plan.entries()) {
      checkCancel(job.id)
      const png = join(out, `${i + 1}.png`)
      writeFileSync(png, await edit(job, images, shot, i, 'RealESRGAN_x2plus.pth'))
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

  async function videoJob(job, plan, out) {
    const images = await uploadPhotos(job)
    // 1. Кадр с человеком в сцене шаблона
    const stillPng = join(out, 'still.png')
    writeFileSync(stillPng, await edit(job, images, plan.still, 0))
    await toWebp(stillPng, join(out, 'poster.webp'), 720)
    q.progress.run(1, '[]', job.id)
    checkCancel(job.id)

    // 2. Ролик из кадра
    const still = await uploadImage(readFileSync(stillPng), `creator-u-${job.id}-still.png`)
    rmSync(stillPng)
    const clips = await withRetry(() =>
      runWorkflow(
        wanVideoWorkflow({
          image: still,
          prompt: plan.video.prompt,
          negative:
            'blurry, distorted face, extra limbs, static, jitter, flicker, watermark, text, morphing',
          width: plan.video.width,
          height: plan.video.height,
          seed: plan.video.seed,
          prefix: `creator-user/${job.id}-clip`,
        }),
        { front: true, timeoutMs: 1_800_000 },
      ),
    )
    const silent = join(out, 'silent.mp4')
    writeFileSync(silent, await download(clips[0]))
    q.progress.run(2, '[]', job.id)
    checkCancel(job.id)

    // 3. Музыка шаблона
    const music = join(config.mediaDir, 'music', `${job.target}.mp3`)
    const final = join(out, 'video.mp4')
    const video = [
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
    ]
    await run(
      'ffmpeg',
      existsSync(music)
        ? [
            '-y',
            '-loglevel',
            'error',
            '-i',
            silent,
            '-i',
            music,
            '-map',
            '0:v',
            '-map',
            '1:a',
            ...video,
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-af',
            'afade=t=out:st=4:d=1',
            '-shortest',
            final,
          ]
        : ['-y', '-loglevel', 'error', '-i', silent, ...video, '-an', final],
      { timeout: 120_000 },
    )
    rmSync(silent)
    const results = [
      {
        type: 'video',
        src: `/media/jobs/${job.id}/video.mp4`,
        download: `/media/jobs/${job.id}/video.mp4`,
        poster: `/media/jobs/${job.id}/poster.webp`,
        width: plan.video.width,
        height: plan.video.height,
      },
    ]
    q.progress.run(3, JSON.stringify(results), job.id)
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
      const results =
        job.kind === 'video' ? await videoJob(job, plan, out) : await photoJob(job, plan, out)
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
