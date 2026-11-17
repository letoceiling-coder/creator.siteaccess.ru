import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button.tsx'

describe('Button', () => {
  it('exposes an accessible name', () => {
    render(<Button>Сохранить</Button>)
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('disables itself while loading', () => {
    render(<Button loading>Сохранить</Button>)
    const button = screen.getByRole('button', { name: 'Сохранить' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
