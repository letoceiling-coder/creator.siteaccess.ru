/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { motionCss } from '@/config/motion.ts'
import { controlPairs, palette, textPairs } from '@/config/palette.ts'

const css = readFileSync(resolve(cwd(), 'src/styles/global.css'), 'utf8')

function channel(value: number): number {
  const ratio = value / 255
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const color = Number.parseInt(hex.slice(1), 16)
  const red = channel((color >> 16) & 255)
  const green = channel((color >> 8) & 255)
  const blue = channel(color & 255)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('design tokens', () => {
  it('keeps the palette source and the stylesheet in sync', () => {
    for (const theme of Object.values(palette)) {
      for (const color of Object.values(theme)) {
        expect(css).toContain(color)
      }
    }
  })

  it('meets WCAG AA contrast for text and control boundaries', () => {
    for (const theme of Object.values(palette)) {
      for (const [foreground, background] of textPairs) {
        expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(4.5)
      }
      for (const [foreground, background] of controlPairs) {
        expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('publishes the shared motion durations', () => {
    expect(css).toContain(`--duration-fast: ${motionCss.fast}`)
    expect(css).toContain(`--duration-base: ${motionCss.base}`)
    expect(css).toContain(`--duration-slow: ${motionCss.slow}`)
    expect(css).toContain('prefers-reduced-motion')
  })
})
