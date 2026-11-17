import { describe, expect, it } from 'vitest'
import { cn } from './cn.ts'

describe('cn', () => {
  it('keeps the later conflicting utility', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('keeps font size and text color together', () => {
    expect(cn('text-accent-ink', 'text-body')).toContain('text-accent-ink')
    expect(cn('text-accent-ink', 'text-body')).toContain('text-body')
  })
})
