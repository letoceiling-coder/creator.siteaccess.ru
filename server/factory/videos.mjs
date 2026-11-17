#!/usr/bin/env node
/**
 * Демо-ролики для 30 видеошаблонов: кадр (Qwen-Image) → видео 5 с (Wan 2.2) → музыка → mp4.
 *   node videos.mjs run [--limit N] [--only id]   сделать недостающие
 *   node videos.mjs mux                           заново подложить музыку
 *   node videos.mjs status
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import {
  download,
  qwenImageWorkflow,
  runWorkflow,
  uploadImage,
  wanVideoWorkflow,
} from './comfy.mjs'
import { scenes, size } from './video-scenes.mjs'

const templates = JSON.parse(
  readFileSync(new URL('./video-templates.json', import.meta.url), 'utf8'),
)
const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/video`
const musicDir = `${root}/music`
const statePath = `${dir}/state.json`
mkdirSync(dir, { recursive: true })
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

const style =
  'photorealistic, cinematic still, natural skin texture, realistic hands, film color grading, high detail'
const negativeStill =
  'text, watermark, logo, deformed hands, extra fingers, distorted face, blurry, cartoon, 3d render'
const negativeVideo =
  'blurry, distorted face, extra limbs, static, jitter, flicker, watermark, text, morphing'

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(state.done))
}

function mux(id) {
  const raw = `${dir}/${id}.silent.mp4`
  const out = `${dir}/${id}.mp4`
  const music = `${musicDir}/${id}.mp3`
  if (existsSync(music)) {
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      raw,
      '-i',
      music,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-af',
      'afade=t=out:st=4:d=1',
      '-shortest',
      '-movflags',
      '+faststart',
      out,
    ])
    return true
  }
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    raw,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    out,
  ])
  return false
}

async function make(t, index) {
  const [scene, motion] = scenes[t.id] ?? [t.blurb, t.shots[1]]
  const sz = size[t.ratio]
  // 1. Кадр
  const stills = await runWorkflow(
    qwenImageWorkflow({
      prompt: `${scene}. ${style}`,
      negative: negativeStill,
      width: sz.still[0],
      height: sz.still[1],
      seed: 9000 + index * 13,
      prefix: `creator/vstill-${t.id}`,
    }),
  )
  const png = await download(stills[0])
  const name = await uploadImage(png, `creator-${t.id}.png`)
  // 2. Видео
  const clips = await runWorkflow(
    wanVideoWorkflow({
      image: name,
      prompt: `${motion}, cinematic, natural motion, smooth camera`,
      negative: negativeVideo,
      width: sz.video[0],
      height: sz.video[1],
      seed: 3000 + index * 7,
      prefix: `creator/vclip-${t.id}`,
    }),
    { timeoutMs: 1_800_000 },
  )
  writeFileSync(`${dir}/${t.id}.silent.mp4`, await download(clips[0]))
  writeFileSync(`${dir}/${t.id}.png`, png)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    `${dir}/${t.id}.png`,
    '-vf',
    'scale=720:-2',
    '-quality',
    '82',
    `${dir}/${t.id}-poster.webp`,
  ])
  rmSync(`${dir}/${t.id}.png`)
  const withMusic = mux(t.id)
  state.done[t.id] = {
    src: `/media/video/${t.id}.mp4`,
    poster: `/media/video/${t.id}-poster.webp`,
    ratio: t.ratio,
    seconds: 5,
    withMusic,
  }
  save()
}

const [cmd = 'status', ...rest] = process.argv.slice(2)
const arg = (flag) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : undefined)
const limit = arg('--limit') ? Number(arg('--limit')) : Infinity
const only = arg('--only')

if (cmd === 'status') {
  const done = Object.values(state.done)
  console.log(
    `${done.length} из ${templates.length} роликов готово, с музыкой: ${done.filter((d) => d.withMusic).length}`,
  )
} else if (cmd === 'mux') {
  for (const id of Object.keys(state.done)) {
    state.done[id].withMusic = mux(id)
    console.log(id, state.done[id].withMusic ? 'с музыкой' : 'без музыки')
  }
  save()
} else if (cmd === 'run') {
  const todo = templates
    .map((t, i) => [t, i])
    .filter(([t]) => (only ? t.id === only : !state.done[t.id]))
    .slice(0, limit)
  console.log(`К работе: ${todo.length} роликов`)
  let failed = 0
  for (const [n, [t, i]] of todo.entries()) {
    const started = Date.now()
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await make(t, i)
        console.log(
          `[${n + 1}/${todo.length}] ${t.id} за ${((Date.now() - started) / 1000).toFixed(0)} с`,
        )
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
  console.error('Команды: run [--limit N] [--only id], mux, status')
  process.exit(1)
}
