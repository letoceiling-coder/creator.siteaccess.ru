import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

test.describe('platform shell', () => {
  test('serves browser, Telegram, and MAX from one shell', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-390' && info.project.name !== 'desktop-1280')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    for (const root of ['/', '/telegram', '/max']) {
      await page.goto(root, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toContainText('герой')
      await expectNoHorizontalOverflow(page)
    }

    await page.goto('/dev/shell', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('platform-label')).toHaveText('Браузер')
    await page.goto('/telegram/photos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()

    for (const path of [
      '/photos',
      '/telegram/photos',
      '/max/photos/north',
      '/photos/north/create',
      '/video',
      '/max/video/viral-dance',
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }

    await page.goto('/missing')
    await expect(page.getByRole('alert')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  })

  test('switches the theme without leaving the shell', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1280')
    await page.addInitScript(() => localStorage.setItem('studio-theme', 'light'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Включить светлую тему' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
