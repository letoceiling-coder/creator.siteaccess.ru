/**
 * Что генерируется для задачи пользователя. Промпты собираются только из готовых пресетов:
 * свободного текста от пользователя нет, это ограничивает злоупотребления.
 */
import { readFileSync } from 'node:fs'
import { locations } from '../factory/locations.mjs'
import { scenes, size } from '../factory/video-scenes.mjs'
import { camera, directShots, lighting } from './directing.mjs'

const templates = JSON.parse(
  readFileSync(new URL('../factory/video-templates.json', import.meta.url), 'utf8'),
)

/** Сценарии каталога сайта → локации фабрики. Любую локацию можно заказать и по её id. */
const scenarioToLocation = {
  north: 'north-shore',
  dubai: 'neon-roof',
  editorial: 'editorial-grey',
  yellow: 'yellow-street',
  portrait: 'business-portrait',
  room: 'study-room',
}

export const outfits = ['', 'wearing an elegant light beige suit', 'wearing a dark long wool coat']

export const times = {
  day: 'soft natural daylight',
  dusk: 'warm golden hour sunset light',
  night: 'night scene with ambient city or practical lights',
}

const identity =
  'This is the exact same person as in the reference photos: keep the face, facial features, skin tone, age and identity unchanged. Take only the identity from the reference: do not copy its pose, framing, clothing or background.'
const style = `${camera}.`
export const negative =
  'different person, changed face, distorted face, oversized head, disproportionate body, deformed hands, extra fingers, blurry, text, watermark, logo, cartoon, 3d render, nudity'

export function photoPlan(target, options) {
  const locationId = Object.hasOwn(scenarioToLocation, target) ? scenarioToLocation[target] : target
  const loc = locations.find((l) => l.id === locationId)
  if (!loc) return undefined
  const outfit = outfits[options.outfit] ?? ''
  const light = lighting[options.time] ?? lighting.day
  return directShots(loc.id).map((shot, i) => ({
    type: 'photo',
    name: shot.name,
    width: 1104,
    height: 1472,
    seed: 70_000 + i * 97,
    prompt: `${shot.camera}. Subject: the person from the reference photos${outfit ? `, ${outfit}` : ''}, ${shot.pose}. Location: ${loc.scene}. Light: ${light}. Palette: ${loc.palette}. ${identity} ${camera}.`,
  }))
}

/**
 * Видеошаблон как работа съёмочной группы: три плана с разной оптикой и движением камеры,
 * склейка с переходами и музыкой — ролик около 14 секунд.
 */
const videoShots = [
  {
    name: 'Общий план',
    frame:
      'Wide establishing cinematic frame, 24mm lens, full body, the person walks naturally through the environment, arms relaxed',
    move: 'smooth slow dolly-in establishing camera move',
  },
  {
    name: 'Средний план',
    frame:
      'Medium shot from a three-quarter angle, 50mm lens, waist-up, one hand in a pocket, head turned toward the camera',
    move: 'slow cinematic orbit around the person, parallax in the background',
  },
  {
    name: 'Крупный план',
    frame:
      'Head-and-shoulders portrait cropped at mid-chest, 85mm lens, shallow depth of field, natural anatomical proportions, hands are not visible',
    move: 'very slow push-in on the face, the person blinks and gives a subtle warm smile into the camera, hands stay out of frame',
  },
]

export function videoPlan(target, options) {
  const template = templates.find((t) => t.id === target)
  const scene = Object.hasOwn(scenes, target) ? scenes[target] : undefined
  if (!template || !scene) return undefined
  const sz = size[template.ratio]
  const outfit = outfits[options.outfit] ?? ''
  return {
    template,
    shots: videoShots.map((shot, i) => ({
      name: shot.name,
      still: {
        width: sz.still[0],
        height: sz.still[1],
        seed: 81_000 + i * 131,
        prompt: `${shot.frame}. Subject: the person from the reference photos as the main character${outfit ? `, ${outfit}` : ''}. Scene: ${scene[0]}. ${identity} ${style}`,
      },
      video: {
        width: sz.video[0],
        height: sz.video[1],
        seed: 82_000 + i * 17,
        prompt: `${i === 2 ? shot.move : `${scene[1]}, ${shot.move}`}, cinematic, natural motion, the face stays consistent`,
      },
    })),
  }
}

/** «Оживить фото»: движение внутри снимка пользователя. Только готовые варианты движения. */
export const motions = {
  smile:
    'the person smiles gently, blinks naturally and slightly tilts the head, the camera is almost still',
  wind: 'a gentle breeze moves the hair and clothes, the person breathes calmly and blinks, soft natural motion',
  turn: 'the person slowly turns the head toward the camera and smiles warmly, natural motion',
  push: 'slow cinematic push-in toward the face, the person blinks and smiles softly',
  archive:
    'the people in this old photograph come alive: they blink, smile softly and move slightly, the photo keeps its original vintage look and colors',
}

/** Размер видео под пропорции снимка: около 480p, кратно 16. */
function videoSize(w, h) {
  const area = 480 * 832
  const ratio = Math.min(Math.max(w / h, 9 / 16), 16 / 9)
  const width = Math.round(Math.sqrt(area * ratio) / 16) * 16
  const height = Math.round(area / width / 16) * 16
  return { width, height }
}

export function animatePlan(target, options) {
  const motion = Object.hasOwn(motions, target) ? motions[target] : undefined
  if (!motion || ![5, 10].includes(options.duration)) return undefined
  const { width, height } = videoSize(options.w ?? 3, options.h ?? 4)
  const prompt = `${motion}, the face and identity stay exactly the same, realistic natural movement, no morphing`
  return {
    width,
    height,
    clips: Array.from({ length: options.duration / 5 }, (_, i) => ({
      seed: 90_000 + i * 11,
      prompt: i === 0 ? prompt : `${prompt}, the motion continues smoothly`,
    })),
  }
}

export function planFor(kind, target, options) {
  if (kind === 'video') return videoPlan(target, options)
  if (kind === 'animate') return animatePlan(target, options)
  return photoPlan(target, options)
}

/** Шаги для прогресса: фото — кадры; видео — 3 кадра, 3 плана и склейка; оживление — клипы. */
export function stepsFor(kind, plan) {
  if (kind === 'video') return plan.shots.length * 2 + 1
  if (kind === 'animate') return plan.clips.length
  return plan.length
}
