import { describe, expect, it } from 'vitest'
import { displayNameResolver, displayNameSchema } from './forms.ts'

describe('display name contract', () => {
  it('rejects a short name', () => {
    const result = displayNameSchema.safeParse({ displayName: 'a' })
    expect(result.success).toBe(false)
  })

  it('accepts a usable name', () => {
    const result = displayNameSchema.safeParse({ displayName: 'Ada' })
    expect(result.success).toBe(true)
  })

  it('exposes a form resolver', () => {
    expect(typeof displayNameResolver).toBe('function')
  })
})
