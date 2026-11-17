import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Checkbox } from './checkbox.tsx'
import { Tabs } from './tabs.tsx'

function Example() {
  const [checked, setChecked] = useState(false)
  return (
    <Checkbox
      label="Сохранять"
      checked={checked}
      onChange={(event) => setChecked(event.currentTarget.checked)}
    />
  )
}

describe('Checkbox', () => {
  it('toggles from a click', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const control = screen.getByRole('checkbox', { name: 'Сохранять' })
    expect(control).not.toBeChecked()
    await user.click(control)
    expect(control).toBeChecked()
  })
})

describe('Tabs', () => {
  it('shows the selected panel', async () => {
    const user = userEvent.setup()
    render(
      <Tabs
        label="Режимы"
        tabs={[
          { id: 'a', label: 'Первый', panel: 'Панель один' },
          { id: 'b', label: 'Второй', panel: 'Панель два' },
        ]}
      />,
    )
    expect(screen.getByText('Панель один')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Второй' }))
    expect(screen.getByText('Панель два')).toBeVisible()
  })
})
