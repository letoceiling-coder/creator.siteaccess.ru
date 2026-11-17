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
  'different person, changed face, distorted face, deformed hands, extra fingers, blurry, text, watermark, logo, cartoon, 3d render, nudity'

export function photoPlan(target, options) {
  const locationId = scenarioToLocation[target] ?? target
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

export function videoPlan(target, options) {
  const template = templates.find((t) => t.id === target)
  const scene = scenes[target]
  if (!template || !scene) return undefined
  const sz = size[template.ratio]
  const outfit = outfits[options.outfit] ?? ''
  return {
    template,
    still: {
      width: sz.still[0],
      height: sz.still[1],
      seed: 81_000,
      prompt: `Photo with the person from the reference photos as the main subject${outfit ? `, ${outfit}` : ''}. Scene: ${scene[0]}. ${identity} ${style}`,
    },
    video: {
      width: sz.video[0],
      height: sz.video[1],
      seed: 82_000,
      prompt: `${scene[1]}, cinematic, natural motion, smooth camera, the face stays consistent`,
    },
  }
}

export function planFor(kind, target, options) {
  return kind === 'video' ? videoPlan(target, options) : photoPlan(target, options)
}

/** Сколько шагов у задачи: для фото — кадры, для видео — кадр, ролик, музыка. */
export function stepsFor(kind, plan) {
  return kind === 'video' ? 3 : plan.length
}
