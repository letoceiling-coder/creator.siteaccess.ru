import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Switch } from './switch.tsx'

function Example() {
  const [checked, setChecked] = useState(false)
  return (
    <Switch
      label="Уведомления"
      checked={checked}
      onChange={(event) => setChecked(event.currentTarget.checked)}
    />
  )
}

describe('Switch', () => {
  it('toggles from a click', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const control = screen.getByRole('switch', { name: 'Уведомления' })
    expect(control).not.toBeChecked()
    await user.click(control)
    expect(control).toBeChecked()
  })
})
