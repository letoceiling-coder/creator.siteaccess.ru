#!/usr/bin/env node
/**
 * Каталог видеошаблонов для сайта, API и фабрики собирается из stories.mjs:
 *   node server/factory/build-templates.mjs
 * Пишет server/factory/video-templates.json и src/features/catalog/video-templates.json.
 */
import { writeFileSync } from 'node:fs'
import { stories } from './stories.mjs'

const templates = stories.map((t) => ({
  id: t.id,
  title: t.title,
  category: t.category,
  seconds: t.seconds,
  ratio: t.ratio,
  people: t.people,
  blurb: t.blurb,
  shots: t.beats.map((b) => b.ru),
  genre: t.genre,
  bpm: t.bpm,
  mood: t.mood,
}))

const json = `${JSON.stringify(templates, null, 2)}\n`
for (const path of ['./video-templates.json', '../../src/features/catalog/video-templates.json']) {
  writeFileSync(new URL(path, import.meta.url), json)
}
console.log(`шаблонов: ${templates.length}, пар: ${templates.filter((t) => t.people === 2).length}`)

// Фото-сюжеты: id, название, категория. Образцы приходят с сервера (photo-samples.mjs).
const { photoStories, photoCategories } = await import('./photo-stories.mjs')
const photoJson = `${JSON.stringify(
  {
    categories: photoCategories.map(([id, label]) => ({ id, label })),
    stories: photoStories.map((s) => ({ id: s.id, title: s.title, category: s.category })),
  },
  null,
  2,
)}\n`
writeFileSync(new URL('../../src/features/catalog/photo-templates.json', import.meta.url), photoJson)
console.log(`фото-сюжетов: ${photoStories.length}`)
