import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
}

test.describe('component stand', () => {
  test('renders, validates, and stays inside the viewport', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto('/dev/foundation', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Helios' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Проверить' }).click()
    await expect(page.getByText('Минимум 2 символа')).toBeVisible()

    await page.getByRole('button', { name: 'Открыть окно' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    )
    expect(serious).toEqual([])
    expect(errors).toEqual([])
  })

  test('keeps the stand available with reduced motion', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1280')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/dev/foundation', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Helios' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})
