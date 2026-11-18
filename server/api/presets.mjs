/**
 * Что генерируется для задачи пользователя. Промпты собираются только из готовых пресетов:
 * свободного текста от пользователя нет, это ограничивает злоупотребления.
 */
import { photoStories } from '../factory/photo-stories.mjs'
import { stories } from '../factory/stories.mjs'
import { camera, directShots, lighting } from './directing.mjs'
import { crossDressingNegative, genderFromReference } from './gender.mjs'

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

const identity = `This is the exact same person as in the reference photos: keep the face, facial features, skin tone, age and identity unchanged. Take only the identity from the reference: do not copy its pose, framing, clothing or background. ${genderFromReference}`
const style = `${camera}.`
export const negative = `different person, changed face, distorted face, oversized head, disproportionate body, deformed hands, extra fingers, blurry, text, watermark, logo, cartoon, 3d render, nudity, ${crossDressingNegative}`

export function photoPlan(target, options) {
  const locationId = Object.hasOwn(scenarioToLocation, target) ? scenarioToLocation[target] : target
  const loc = photoStories.find((l) => l.id === locationId)
  if (!loc) return undefined
  const outfit = outfits[options.outfit] ?? ''
  const light = lighting[options.time] ?? lighting.day
  return directShots(loc.id, loc.props).map((shot, i) => ({
    type: 'photo',
    name: shot.name,
    width: 1104,
    height: 1472,
    seed: 70_000 + i * 97,
    prompt: `${shot.camera}. Subject: the person from the reference photos${outfit ? `, ${outfit}` : ''}, ${shot.pose}. Location: ${loc.scene}. Light: ${light}. Palette: ${loc.palette}. ${faceVisible} ${identity} ${camera}.`,
  }))
}

/** Лицо целиком в кадре: без этого ролик и фото отбраковываются проверкой. */
export const faceVisible =
  'The face is clearly visible and turned toward the camera, the whole head is fully inside the frame with headroom above it.'
const facesVisible =
  'Both faces are clearly visible and turned toward the camera, both heads fully inside the frame with headroom.'
const identityPair =
  'These are exactly the two people from the reference photos: the first reference photo is the first person, the second reference photo is the second person. Keep both faces, skin tones, ages and identities unchanged. Take only identities from the references, not poses, clothing or backgrounds. Each person’s clothing and styling match their own gender: a man in men’s clothing, a woman in women’s clothing.'

const sizes = {
  '9:16': { still: [928, 1664], video: [480, 832] },
  '16:9': { still: [1664, 928], video: [832, 480] },
  '1:1': { still: [1328, 1328], video: [640, 640] },
}

/**
 * Видеошаблон — сюжет из четырёх сцен-действий (stories.mjs): у каждой свой первый кадр
 * и своё действие с движением камеры. Склейка с переходами и музыкой — около 19 секунд.
 */
export function videoPlan(target, options) {
  const story = stories.find((t) => t.id === target)
  if (!story) return undefined
  const sz = sizes[story.ratio]
  const pair = story.people === 2
  const outfit = pair ? '' : (outfits[options.outfit] ?? '')
  // Демо фабрики: оба героя уже на одном кадре-референсе.
  const pairIdentity = options.pairFromOneImage
    ? 'These are exactly the same two people as in the reference image: keep both faces, skin tones, ages and identities unchanged. Take only identities from the reference, not poses or backgrounds.'
    : identityPair
  const subject = pair
    ? 'Subject: the two people from the reference photos'
    : `Subject: the person from the reference photos${outfit ? `, ${outfit}` : ''}`
  return {
    template: story,
    people: story.people,
    shots: story.beats.map((beat, i) => ({
      name: beat.ru,
      still: {
        width: sz.still[0],
        height: sz.still[1],
        seed: 81_000 + i * 131,
        prompt: `Cinematic film still: ${beat.still}. ${subject}. ${pair ? facesVisible : faceVisible} ${pair ? pairIdentity : identity} ${style}`,
      },
      video: {
        width: sz.video[0],
        height: sz.video[1],
        seed: 82_000 + i * 17,
        prompt: `${beat.motion}, cinematic, natural realistic motion, ${pair ? 'both faces stay' : 'the face stays'} visible, consistent and inside the frame, ${pair ? 'both people keep' : 'the person keeps'} exactly the same face and identity throughout the whole clip, no face morphing`,
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

/** Свои сюжеты (scenarios.mjs): загрузчик согласованного плана подключает сервер. */
let loadCustom = () => undefined
export function setCustomLoader(fn) {
  loadCustom = fn
}
export const isCustom = (target) => /^s-[0-9a-f]{16}$/.test(target)

/**
 * План по сюжету пользователя. Описание сцены пишет агент (уже проверенное модерацией),
 * а правила студии — лицо, сходство, одежда по полу, стиль — добавляются здесь всегда.
 */
function customPlan(kind, target) {
  const sc = loadCustom(target.slice(2))
  if (!sc || sc.kind !== kind) return undefined
  if (kind === 'photo')
    return sc.plan.shots.map((shot, i) => ({
      type: 'photo',
      name: `Кадр ${i + 1}`,
      width: 1104,
      height: 1472,
      seed: 70_000 + i * 97,
      prompt: `${shot.en}. Subject: the person from the reference photos. ${faceVisible} ${identity} ${camera}.`,
    }))
  if (kind === 'video') {
    const sz = sizes['9:16']
    return {
      template: { id: target, title: sc.plan.title },
      people: 1,
      custom: true,
      music: sc.music ?? null,
      shots: sc.plan.shots.map((shot, i) => ({
        name: `Сцена ${i + 1}`,
        still: {
          width: sz.still[0],
          height: sz.still[1],
          seed: 81_000 + i * 131,
          prompt: `Cinematic film still: ${shot.still}. Subject: the person from the reference photos. ${faceVisible} ${identity} ${style}`,
        },
        video: {
          width: sz.video[0],
          height: sz.video[1],
          seed: 82_000 + i * 17,
          prompt: `${shot.motion}, cinematic, natural realistic motion, the face stays visible, consistent and inside the frame, the person keeps exactly the same face and identity throughout the whole clip, no face morphing`,
        },
      })),
    }
  }
  if (kind === 'song') return { ...sc.plan, seconds: 120 }
  return undefined
}

/**
 * Переделка: правки рецензента к плану — выбранные кадры, добавки к промптам и негативу,
 * новые сиды и строгий контроль сходства. План остаётся тем же сюжетом.
 */
export function applyFixes(kind, plan, fixes) {
  if (!plan || !fixes) return plan
  const shift = fixes.seedShift ?? 50_000
  const add = (prompt, i) => {
    const extra = fixes.shots?.[i]?.add
    return extra ? `${prompt} ${extra}` : prompt
  }
  const neg = (i) => [fixes.negative, fixes.shots?.[i]?.negative].filter(Boolean).join(', ')
  const strict = Boolean(fixes.strict)
  if (kind === 'photo') {
    const keep = fixes.frames?.length ? fixes.frames : plan.map((_, i) => i)
    return plan
      .map((shot, i) => ({
        ...shot,
        prompt: add(shot.prompt, i),
        seed: shot.seed + shift,
        negativeExtra: neg(i),
        strict,
      }))
      .filter((_, i) => keep.includes(i))
  }
  if (kind === 'video')
    return {
      ...plan,
      shots: plan.shots.map((shot, i) => ({
        ...shot,
        still: {
          ...shot.still,
          prompt: add(shot.still.prompt, i),
          seed: shot.still.seed + shift,
          negativeExtra: neg(i),
          strict,
        },
        video: {
          ...shot.video,
          prompt: fixes.shots?.[i]?.motion
            ? `${shot.video.prompt}, ${fixes.shots[i].motion}`
            : shot.video.prompt,
          seed: shot.video.seed + shift,
        },
      })),
    }
  if (kind === 'animate')
    return {
      ...plan,
      clips: plan.clips.map((clip, i) => ({
        ...clip,
        prompt: add(clip.prompt, i),
        seed: clip.seed + shift,
      })),
    }
  if (kind === 'song')
    return {
      ...plan,
      tags: fixes.shots?.[0]?.add ? `${plan.tags}, ${fixes.shots[0].add}` : plan.tags,
      seedShift: shift,
    }
  return plan
}

export function planFor(kind, target, options) {
  if (isCustom(target)) return customPlan(kind, target)
  if (kind === 'video') return videoPlan(target, options)
  if (kind === 'animate') return animatePlan(target, options)
  return photoPlan(target, options)
}

/** Шаги для прогресса: фото — кадры; видео — 3 кадра, 3 плана и склейка; оживление — клипы. */
export function stepsFor(kind, plan) {
  if (kind === 'video') return plan.shots.length * 2 + 1 + (plan.music ? 1 : 0)
  if (kind === 'song') return 1
  if (kind === 'animate') return plan.clips.length
  return plan.length
}
