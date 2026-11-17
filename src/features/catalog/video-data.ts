import { scenarios } from './data.ts'
import rawTemplates from './video-templates.json' with { type: 'json' }

export type VideoCategoryId = 'all' | 'trend' | 'couple' | 'story' | 'party' | 'style' | 'brand'

export interface VideoMusic {
  genre: string
  bpm: number
  mood: string
}

export interface VideoTemplate {
  id: string
  title: string
  category: Exclude<VideoCategoryId, 'all'>
  seconds: number
  ratio: '9:16' | '16:9' | '1:1'
  /** Сколько человек в сюжете: 2 — пара или друзья, нужно два фото. */
  people: 1 | 2
  blurb: string
  /** Сценарий: четыре сцены-действия по порядку. */
  shots: string[]
  music: VideoMusic
  cover: string
  frames: string[]
}

export const videoCategories: { id: VideoCategoryId; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'trend', label: 'Тренды' },
  { id: 'couple', label: 'Вдвоём' },
  { id: 'story', label: 'Кино' },
  { id: 'party', label: 'Праздники' },
  { id: 'style', label: 'Стиль' },
  { id: 'brand', label: 'Бренд' },
]

// Данные собираются из server/factory/stories.mjs (build-templates.mjs). Музыка — описание трека.
const rows = rawTemplates as Array<{
  id: string
  title: string
  category: Exclude<VideoCategoryId, 'all'>
  seconds: number
  ratio: VideoTemplate['ratio']
  people: number
  blurb: string
  shots: string[]
  genre: string
  bpm: number
  mood: string
}>

// Запасные кадры, пока у шаблона нет готового ролика на сервере.
const pool = [...new Set(scenarios.flatMap((s) => [s.cover, ...s.gallery]))]

export const videoTemplates: VideoTemplate[] = rows.map((row, i) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  seconds: row.seconds,
  ratio: row.ratio,
  people: row.people === 2 ? 2 : 1,
  blurb: row.blurb,
  shots: row.shots,
  music: { genre: row.genre, bpm: row.bpm, mood: row.mood },
  cover: pool[i % pool.length] ?? '',
  frames: row.shots.map((_, k) => pool[(i + k * 3) % pool.length] ?? ''),
}))
