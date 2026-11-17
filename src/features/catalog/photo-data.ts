import type { PhotoStorySamples } from '@/features/media/use-media.ts'
import { scenarios, type Scenario } from './data.ts'
import raw from './photo-templates.json' with { type: 'json' }

export interface PhotoStory {
  id: string
  title: string
  category: string
}

export const photoCategories: { id: string; label: string }[] = [
  { id: 'all', label: 'Все' },
  ...raw.categories,
]

export const photoStories: PhotoStory[] = raw.stories

const labelOf = (id: string) => photoCategories.find((c) => c.id === id)?.label ?? ''

// Запасная обложка, пока сервер не сделал образцы сюжета.
const pool = [...new Set(scenarios.flatMap((s) => [s.cover, ...s.gallery]))]

/** Сюжет каталога в виде сценария: обложка и примеры кадров — с сервера, если готовы. */
export function toScenario(story: PhotoStory, samples?: PhotoStorySamples, index = 0): Scenario {
  const label = labelOf(story.category)
  return {
    id: story.id,
    title: story.title,
    tag: label,
    category: story.category,
    frames: 5,
    cover: samples?.cover ?? pool[index % pool.length] ?? '',
    gallery: samples?.shots.map((s) => s.src) ?? [],
    blurb: `${label}: пять кадров с разных ракурсов — общий план, кадр снизу или сидя, сверху, портрет и момент в движении. Как у профессионального фотографа.`,
    eta: 'около 5 минут',
  }
}

/** Сюжет по id: новые фото-сюжеты, затем прежние сценарии (старые ссылки и задачи). */
export function findScenario(
  id: string | undefined,
  samples: Record<string, PhotoStorySamples>,
): Scenario | undefined {
  if (!id) return undefined
  const index = photoStories.findIndex((s) => s.id === id)
  const story = photoStories[index]
  if (story) return toScenario(story, samples[id], index)
  return scenarios.find((s) => s.id === id)
}
