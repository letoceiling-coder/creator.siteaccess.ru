#!/usr/bin/env node
/**
 * Образцы фото-сюжетов для каталога: обложка + 3 кадра с одним и тем же вымышленным героем,
 * снятые по режиссуре (directing.mjs). Лицо проверяется детектором, иначе пересъёмка.
 * Для 30 старых локаций берутся готовые кадры фабрики (кроме «Детали» без лица).
 *
 *   node photo-samples.mjs covers     только обложки (быстро)
 *   node photo-samples.mjs run        обложки и дополнительные кадры
 *   node photo-samples.mjs status
 *
 * Запускать из /opt/creator-studio/factory.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { camera, directShots, lighting } from '../api/directing.mjs'
import { faceVisible, negative } from '../api/presets.mjs'
import {
  download,
  qwenEditWorkflow,
  qwenImageWorkflow,
  runWorkflow,
  uploadImage,
} from './comfy.mjs'
import { imageHasFace } from './faces.mjs'
import { photoStories } from './photo-stories.mjs'

const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/photo-stories`
const statePath = `${dir}/state.json`
mkdirSync(dir, { recursive: true })
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

/** Вымышленные герои: разные возраст, внешность и стиль. */
const cast = [
  'a young woman with long dark hair',
  'a man in his early 30s with short dark hair and light stubble',
  'a woman in her late 20s with wavy auburn hair and freckles',
  'a woman in her 30s with a sleek blonde bob',
  'a young man with curly brown hair',
  'a woman in her 40s with elegant shoulder-length chestnut hair',
  'a young woman of East Asian appearance with straight black hair',
  'a man in his 40s with salt-and-pepper hair and a neat beard',
  'a young woman with dark skin and long braids',
  'a young woman with platinum blonde long hair',
]

/** Порядок образцов: портрет (обложка), общий план, сверху, момент. */
const order = [3, 0, 2, 4]
const style = `${camera}. Photorealistic, natural skin texture, realistic hands.`

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
  const manifest = {}
  for (const story of photoStories) {
    const item = story.legacy ? legacy(story.id) : state.done[story.id]
    if (item?.shots?.length) manifest[story.id] = item
  }
  writeFileSync(
    `${dir}/manifest.json.tmp`,
    JSON.stringify({ aiGenerated: true, stories: manifest }),
  )
  renameSync(`${dir}/manifest.json.tmp`, `${dir}/manifest.json`)
}

/** Готовые кадры старых локаций (фабрика photos.mjs), без плана «Деталь». */
function legacy(id) {
  try {
    const photos = JSON.parse(readFileSync(`${root}/photos/state.json`, 'utf8')).done
    const kinds = [
      ['close', 'Крупный план'],
      ['wide', 'Общий план'],
      ['medium', 'Средний план'],
      ['motion', 'В движении'],
    ]
    const shots = kinds
      .filter(([k]) => photos[`${id}-${k}`])
      .map(([k, label]) => ({
        src: photos[`${id}-${k}`].src,
        thumb: photos[`${id}-${k}`].thumb,
        label,
      }))
    return shots.length ? { cover: shots[0].src, thumb: shots[0].thumb, shots } : undefined
  } catch {
    return undefined
  }
}

function webp(png, out, width, quality) {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    png,
    '-vf',
    `scale=${width}:-2`,
    '-quality',
    String(quality),
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

function store(story, index, buf, label) {
  const png = `${dir}/${story.id}-${index}.png`
  writeFileSync(png, buf)
  webp(png, `${dir}/${story.id}-${index}.webp`, 1104, 84)
  webp(png, `${dir}/${story.id}-${index}-thumb.webp`, 420, 78)
  rmSync(png)
  return {
    src: `/media/photo-stories/${story.id}-${index}.webp`,
    thumb: `/media/photo-stories/${story.id}-${index}-thumb.webp`,
    label,
  }
}

async function makeCover(story, n) {
  const shots = directShots(story.id, story.props)
  const shot = shots[order[0]]
  const who = cast[n % cast.length]
  const buf = await withFace(async (attempt) => {
    const files = await runWorkflow(
      qwenImageWorkflow({
        prompt: `${shot.camera}. Subject: ${who}, ${shot.pose}. Location: ${story.scene}. Light: ${lighting.day}. Palette: ${story.palette}. ${faceVisible} ${style}`,
        negative,
        width: 1104,
        height: 1472,
        seed: 40_000 + n * 37 + attempt * 1009,
        prefix: `creator/ps-${story.id}-0`,
      }),
    )
    return download(files[0])
  }, `${story.id} обложка`)
  const cover = store(story, 0, buf, shot.name)
  state.done[story.id] = { cover: cover.src, thumb: cover.thumb, shots: [cover], who }
  save()
}

async function makeMore(story, n) {
  const item = state.done[story.id]
  const shots = directShots(story.id, story.props)
  // ComfyUI принимает PNG: перекодируем обложку.
  const tmp = `${dir}/${story.id}-ref.png`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/${story.id}-0.webp`, tmp])
  const ref = await uploadImage(readFileSync(tmp), `creator-ps-${story.id}.png`)
  rmSync(tmp)
  for (const [k, idx] of order.slice(1).entries()) {
    const shot = shots[idx]
    const buf = await withFace(
      async (attempt) => {
        const files = await runWorkflow(
          qwenEditWorkflow({
            images: [ref],
            prompt: `${shot.camera}. Subject: the person from the reference photo, ${shot.pose}. Location: ${story.scene}. Light: ${lighting.day}. Palette: ${story.palette}. ${faceVisible} Keep the face and identity exactly the same as in the reference, do not copy its pose or framing. ${style}`,
            negative,
            seed: 41_000 + n * 37 + k * 211 + attempt * 1009,
            width: 1104,
            height: 1472,
            prefix: `creator/ps-${story.id}-${k + 1}`,
          }),
        )
        return download(files[0])
      },
      `${story.id} кадр ${k + 2}`,
    )
    item.shots.push(store(story, k + 1, buf, shot.name))
    save()
  }
  item.complete = true
  save()
}

const [cmd = 'status'] = process.argv.slice(2)
const fresh = photoStories.filter((s) => !s.legacy)

if (cmd === 'status') {
  const covers = fresh.filter((s) => state.done[s.id]).length
  const complete = fresh.filter((s) => state.done[s.id]?.complete).length
  console.log(
    `сюжетов: ${photoStories.length}; новых с обложкой ${covers}/${fresh.length}, полных ${complete}/${fresh.length}`,
  )
} else if (cmd === 'covers' || cmd === 'run') {
  save()
  for (const [n, story] of fresh.entries()) {
    if (state.done[story.id]) continue
    const t = Date.now()
    try {
      await makeCover(story, n)
      console.log(
        `[обложка ${n + 1}/${fresh.length}] ${story.id} за ${((Date.now() - t) / 1000).toFixed(0)} с`,
      )
    } catch (error) {
      console.error(`${story.id}: ${error.message}`)
    }
  }
  if (cmd === 'run') {
    for (const [n, story] of fresh.entries()) {
      if (!state.done[story.id] || state.done[story.id].complete) continue
      const t = Date.now()
      try {
        await makeMore(story, n)
        console.log(
          `[кадры ${n + 1}/${fresh.length}] ${story.id} за ${((Date.now() - t) / 1000).toFixed(0)} с`,
        )
      } catch (error) {
        console.error(`${story.id}: ${error.message}`)
      }
    }
  }
  console.log('Готово')
} else {
  console.error('Команды: covers, run, status')
  process.exit(1)
}
