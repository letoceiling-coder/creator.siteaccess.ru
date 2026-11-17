import { scenarios } from './data.ts'

export type VideoCategoryId = 'all' | 'trip' | 'style' | 'brand' | 'story' | 'party'

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
  blurb: string
  /** Раскадровка: что происходит в каждом плане. */
  shots: [string, string, string]
  music: VideoMusic
  cover: string
  frames: string[]
}

export const videoCategories: { id: VideoCategoryId; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'trip', label: 'Путешествия' },
  { id: 'style', label: 'Стиль' },
  { id: 'brand', label: 'Бренд' },
  { id: 'story', label: 'Сюжеты' },
  { id: 'party', label: 'Праздник' },
]

import rawTemplates from './video-templates.json' with { type: 'json' }

// Музыка здесь — ТЗ для подбора трека (жанр, темп, настроение). Файлы делает фабрика, см. server/factory.
const rows = rawTemplates as Array<{
  id: string
  title: string
  category: Exclude<VideoCategoryId, 'all'>
  seconds: number
  ratio: VideoTemplate['ratio']
  blurb: string
  shots: [string, string, string]
  genre: string
  bpm: number
  mood: string
}>

// Кадры раскадровки берутся из набора playground, пока нет настоящих превью.
const pool = [...new Set(scenarios.flatMap((s) => [s.cover, ...s.gallery]))]

export const videoTemplates: VideoTemplate[] = rows.map((row, i) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  seconds: row.seconds,
  ratio: row.ratio,
  blurb: row.blurb,
  shots: row.shots,
  music: { genre: row.genre, bpm: row.bpm, mood: row.mood },
  cover: pool[i % pool.length] ?? '',
  frames: [1, 2, 3].map((k) => pool[(i + k * 3) % pool.length] ?? ''),
}))
