import { describe, expect, it } from 'vitest'
import { videoCategories, videoTemplates } from './video-data.ts'

describe('video templates', () => {
  it('has unique ids and a four-scene script for every template', () => {
    expect(videoTemplates.length).toBeGreaterThanOrEqual(30)
    expect(new Set(videoTemplates.map((v) => v.id)).size).toBe(videoTemplates.length)
    for (const v of videoTemplates) {
      expect(v.shots).toHaveLength(4)
      expect(v.cover).not.toBe('')
      expect(v.music.bpm).toBeGreaterThan(50)
    }
  })

  it('fills every category and has templates for two people', () => {
    for (const category of videoCategories.filter((c) => c.id !== 'all')) {
      expect(videoTemplates.some((v) => v.category === category.id)).toBe(true)
    }
    const pairs = videoTemplates.filter((v) => v.people === 2)
    expect(pairs.length).toBeGreaterThanOrEqual(5)
    expect(pairs.every((v) => v.category === 'couple')).toBe(true)
  })
})
