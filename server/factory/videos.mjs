#!/usr/bin/env node
/**
 * Демо-ролики 30 видеошаблонов, формат v3 — как у съёмочной группы, тот же, что получает
 * пользователь: четыре плана (общий, средний, крупный, финал) с одним и тем же вымышленным
 * героем, апскейл ×2 и 32 кадра/с, переходы и музыка шаблона, ≈19 с.
 * Контроль качества: лицо видно целиком на каждом кадре и в 80% кадров каждого клипа,
 * иначе пересъёмка с другим сидом (до трёх попыток).
 *
 *   node videos.mjs run [--limit N] [--only id]   пересобрать то, что ещё не v3
 *   node videos.mjs previews                      превью 6 с для карточек каталога
 *   node videos.mjs status
 *
 * Ролик собирается, только когда трек шаблона уже не короче 22 с (см. music.mjs):
 * до этого шаблон ждёт, а сайт показывает прежнюю версию.
 * Запускать из /opt/creator-studio/factory: нужен ../api/presets.mjs.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { faceVisible, negative, videoPlan } from '../api/presets.mjs'
import { assembleShots } from './assemble.mjs'
import { imageHasFace, MIN_FACE_RATIO, videoFaceRatio } from './faces.mjs'
import {
  download,
  qwenEditWorkflow,
  qwenImageWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from './comfy.mjs'
import { scenes } from './video-scenes.mjs'

const VERSION = 3
const MIN_MUSIC_SECONDS = 22

const templates = JSON.parse(
  readFileSync(new URL('./video-templates.json', import.meta.url), 'utf8'),
)
const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/video`
const work = `${dir}/.work`
const musicDir = `${root}/music`
const statePath = `${dir}/state.json`
mkdirSync(work, { recursive: true })
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

const style =
  'photorealistic cinematic still, shot on a full-frame camera, natural skin texture, realistic hands, accurate anatomy, film color grading, high detail'
const negativeStill =
  'text, watermark, logo, deformed hands, extra fingers, distorted face, oversized head, blurry, cartoon, 3d render'
const negativeVideo =
  'blurry, distorted face, changing face, hands covering the face, extra limbs, extra fingers, static, jitter, flicker, watermark, text, morphing'

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
  writeFileSync(`${dir}/manifest.json.tmp`, JSON.stringify(state.done))
  renameSync(`${dir}/manifest.json.tmp`, `${dir}/manifest.json`)
}

function musicReady(id) {
  try {
    const music = JSON.parse(readFileSync(`${musicDir}/state.json`, 'utf8'))
    return (music.done?.[id]?.seconds ?? 0) >= MIN_MUSIC_SECONDS
  } catch {
    return false
  }
}

function preview(src, out) {
  // Лёгкое превью для карточки: 6 с, 360 px, без звука — запускается само при прокрутке.
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-t',
    '6',
    '-i',
    src,
    '-vf',
    'scale=360:-2,fps=24',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ])
}

async function withFace(make, label) {
  let first
  for (let attempt = 0; attempt < 3; attempt++) {
    const buf = await make(attempt)
    first ??= buf
    if ((await imageHasFace(buf)).ok) return buf
    console.log(`  ${label}: лицо не видно целиком, попытка ${attempt + 2}`)
  }
  return first
}

async function make(t, index) {
  const plan = videoPlan(t.id, { outfit: 0 })
  const scene = scenes[t.id]
  const [first] = plan.shots
  const tag = `${t.id}-v${VERSION}`

  // 1. Герой: общий план по тексту. Он же — референс лица для остальных планов.
  const hero = await withFace(async (attempt) => {
    const files = await runWorkflow(
      qwenImageWorkflow({
        prompt: `${scene[0]}. ${first.still.prompt.split('. Subject:')[0]}. ${faceVisible} ${style}`,
        negative: negativeStill,
        width: first.still.width,
        height: first.still.height,
        seed: 9000 + index * 13 + attempt * 1009,
        prefix: `creator/v3still-${t.id}-0`,
      }),
    )
    return download(files[0])
  }, `${t.id} герой`)
  const heroName = await uploadImage(hero, `creator-${tag}-hero.png`)
  writeFileSync(`${work}/${tag}-hero.png`, hero)

  // 2. Остальные планы того же человека.
  const stills = [hero]
  for (const [i, shot] of plan.shots.entries()) {
    if (i === 0) continue
    stills.push(
      await withFace(
        async (attempt) => {
          const files = await runWorkflow(
            qwenEditWorkflow({
              images: [heroName],
              prompt: shot.still.prompt,
              negative,
              seed: shot.still.seed + index + attempt * 1009,
              width: shot.still.width,
              height: shot.still.height,
              prefix: `creator/v3still-${t.id}-${i}`,
            }),
          )
          return download(files[0])
        },
        `${t.id} план ${i + 1}`,
      ),
    )
  }

  // 3. Клипы Wan с апскейлом и 32 кадрами/с; лицо должно оставаться в кадре.
  const clips = []
  for (const [i, shot] of plan.shots.entries()) {
    const image = await uploadImage(stills[i], `creator-${tag}-${i}.png`)
    let best = { ratio: -1, path: '' }
    for (let attempt = 0; attempt < 3; attempt++) {
      const files = await runWorkflow(
        wanVideoWorkflow({
          image,
          prompt: shot.video.prompt,
          negative: negativeVideo,
          width: shot.video.width,
          height: shot.video.height,
          seed: 3000 + index * 7 + i + attempt * 7919,
          prefix: `creator/v3clip-${t.id}-${i}`,
          finish: true,
        }),
        { timeoutMs: 2_400_000 },
      )
      const path = `${work}/${tag}-${i}-t${attempt}.mp4`
      writeFileSync(path, await download(files[0]))
      const { ratio } = await videoFaceRatio(path)
      if (ratio > best.ratio) {
        if (best.path) rmSync(best.path, { force: true })
        best = { ratio, path }
      } else rmSync(path, { force: true })
      if (ratio >= MIN_FACE_RATIO) break
      console.log(`  ${t.id} клип ${i + 1}: лицо в ${Math.round(ratio * 100)}% кадров, пересъёмка`)
    }
    if (best.ratio < MIN_FACE_RATIO)
      console.log(`  ${t.id} клип ${i + 1}: лучший вариант ${Math.round(best.ratio * 100)}%`)
    clips.push(best.path)
  }

  // 4. Склейка, постер, превью, атомарная замена файлов.
  const next = `${work}/${tag}.mp4`
  const { total, withMusic } = await assembleShots(clips, `${musicDir}/${t.id}.mp3`, next)
  const check = await videoFaceRatio(next)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    `${work}/${tag}-hero.png`,
    '-vf',
    'scale=720:-2',
    '-quality',
    '82',
    `${dir}/${t.id}-poster.webp`,
  ])
  preview(next, `${work}/${tag}-preview.mp4`)
  renameSync(`${work}/${tag}-preview.mp4`, `${dir}/${t.id}-preview.mp4`)
  renameSync(next, `${dir}/${t.id}.mp4`)
  rmSync(`${dir}/${t.id}.silent.mp4`, { force: true })
  for (const c of clips) rmSync(c, { force: true })
  rmSync(`${work}/${tag}-hero.png`, { force: true })

  state.done[t.id] = {
    src: `/media/video/${t.id}.mp4?v=${VERSION}`,
    poster: `/media/video/${t.id}-poster.webp?v=${VERSION}`,
    preview: `/media/video/${t.id}-preview.mp4?v=${VERSION}`,
    ratio: t.ratio,
    seconds: Math.round(total),
    withMusic,
    faceRatio: Math.round(check.ratio * 100) / 100,
    version: VERSION,
  }
  save()
  console.log(`  ${t.id}: ${Math.round(total)} с, лицо в ${Math.round(check.ratio * 100)}% кадров`)
}

const [cmd = 'status', ...rest] = process.argv.slice(2)
const arg = (flag) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : undefined)
const limit = arg('--limit') ? Number(arg('--limit')) : Infinity
const only = arg('--only')

if (cmd === 'status') {
  const done = Object.values(state.done)
  console.log(
    `${done.filter((d) => d.version === VERSION).length} из ${templates.length} роликов в новом формате (≈19 с), всего доступно ${done.length}`,
  )
} else if (cmd === 'previews') {
  for (const [id, item] of Object.entries(state.done)) {
    if (item.preview) continue
    const src = `${dir}/${id}.mp4`
    if (!existsSync(src)) continue
    preview(src, `${dir}/${id}-preview.mp4`)
    item.preview = `/media/video/${id}-preview.mp4?v=${item.version ?? 1}`
    console.log(id, 'превью готово')
  }
  save()
} else if (cmd === 'run') {
  let todo = templates
    .map((t, i) => [t, i])
    .filter(([t]) => (only ? t.id === only : state.done[t.id]?.version !== VERSION))
    .slice(0, limit)
  console.log(`К пересборке: ${todo.length} роликов`)
  let failed = 0
  let n = 0
  while (todo.length) {
    const pick = todo.find(([t]) => musicReady(t.id))
    if (!pick) {
      // Ждём, пока music.mjs удлинит треки.
      await new Promise((r) => setTimeout(r, 60_000))
      continue
    }
    todo = todo.filter((x) => x !== pick)
    const [t, i] = pick
    n += 1
    const started = Date.now()
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await make(t, i)
        console.log(`[${n}] ${t.id} за ${((Date.now() - started) / 1000).toFixed(0)} с`)
        break
      } catch (error) {
        console.error(`${t.id}, попытка ${attempt}: ${error.message}`)
        if (attempt === 3) failed += 1
        else await new Promise((r) => setTimeout(r, 30_000))
      }
    }
  }
  console.log(`Готово. Не удалось: ${failed}`)
} else {
  console.error('Команды: run [--limit N] [--only id], previews, status')
  process.exit(1)
}
