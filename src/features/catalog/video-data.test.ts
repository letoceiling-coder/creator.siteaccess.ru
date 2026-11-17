import { describe, expect, it } from 'vitest'
import { videoCategories, videoTemplates } from './video-data.ts'

describe('video templates', () => {
  it('has 30 templates with unique ids', () => {
    expect(videoTemplates).toHaveLength(30)
    expect(new Set(videoTemplates.map((v) => v.id)).size).toBe(30)
  })

  it('fills every category evenly and keeps data complete', () => {
    for (const category of videoCategories.filter((c) => c.id !== 'all')) {
      expect(videoTemplates.filter((v) => v.category === category.id)).toHaveLength(6)
    }
    for (const v of videoTemplates) {
      expect(v.cover).not.toBe('')
      expect(v.frames.every(Boolean)).toBe(true)
      expect(v.music.bpm).toBeGreaterThan(50)
    }
  })
})
