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

  const videoNegative =
    'blurry, distorted face, changing face, hands covering the face, extra limbs, extra fingers, static, jitter, flicker, watermark, text, morphing'
  const encode = [
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '19',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ]

  async function ffmpeg(args) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300_000 })
  }

  async function seconds(file) {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ])
    return Number(stdout.trim())
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

  /** Видеошаблон: три плана (кадр → клип), склейка с переходами и музыкой ≈ 14 с. */
  async function videoJob(job, plan, out) {
    const images = await uploadPhotos(job)
    const clips = []
    let step = 0
    for (const [i, shot] of plan.shots.entries()) {
      checkCancel(job.id)
      const still = join(out, `still-${i}.png`)
      writeFileSync(still, await edit(job, images, shot.still, i))
      if (i === 0) await toWebp(still, join(out, 'poster.webp'), 720)
      q.progress.run(++step, '[]', job.id)
      checkCancel(job.id)
      const clip = join(out, `clip-${i}.mp4`)
      await wanClip(
        job,
        readFileSync(still),
        `s${i}`,
        shot.video,
        shot.video.width,
        shot.video.height,
        clip,
      )
      rmSync(still)
      clips.push(clip)
      q.progress.run(++step, '[]', job.id)
    }
    checkCancel(job.id)

    const lengths = await Promise.all(clips.map(seconds))
    const fade = 0.5
    const total = lengths.reduce((a, b) => a + b, 0) - fade * (clips.length - 1)
    let chain = '[0:v]'
    let offset = 0
    const parts = []
    for (let i = 1; i < clips.length; i++) {
      offset += lengths[i - 1] - fade
      const outLabel = i === clips.length - 1 ? '[vx]' : `[v${i}]`
      parts.push(
        `${chain}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${outLabel}`,
      )
      chain = outLabel
    }
    parts.push('[vx]format=yuv420p[v]')
    const music = join(config.mediaDir, 'music', `${job.target}.mp3`)
    const inputs = clips.flatMap((c) => ['-i', c])
    const final = join(out, 'video.mp4')
    if (existsSync(music)) {
      parts.push(
        `[${clips.length}:a]apad,atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 1.5).toFixed(3)}:d=1.5[a]`,
      )
      await ffmpeg([
        ...inputs,
        '-i',
        music,
        '-filter_complex',
        parts.join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        ...encode,
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-t',
        total.toFixed(3),
        final,
      ])
    } else {
      await ffmpeg([
        ...inputs,
        '-filter_complex',
        parts.join(';'),
        '-map',
        '[v]',
        ...encode,
        '-an',
        final,
      ])
    }
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
    for (const [i, clip] of plan.clips.entries()) {
      checkCancel(job.id)
      const file = join(out, `part-${i}.mp4`)
      await wanClip(job, image, `a${i}`, clip, plan.width, plan.height, file)
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
