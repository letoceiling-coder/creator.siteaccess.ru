import { expect, test, type Page } from '@playwright/test'

async function withoutMedia(page: Page) {
  // Только файлы фабрики: путь src/features/media/* отдаёт Vite, его трогать нельзя.
  await page.route(/\/media\/(photos|video)\//, (route) =>
    route.fulfill({ status: 404, body: 'not found' }),
  )
}

test.describe('video templates', () => {
  test('plays the storyboard preview and pauses it when there is no clip', async ({ page }) => {
    await withoutMedia(page)
    await page.goto('/video/viral-dance', { waitUntil: 'domcontentloaded' })
    const seek = page.getByRole('slider', { name: 'Перемотка' })
    await expect(seek).toHaveValue('0')
    await page.getByRole('button', { name: 'Смотреть превью' }).click()
    await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0.5)
    await page.getByRole('button', { name: 'Пауза' }).click()
    const paused = await seek.inputValue()
    await page.waitForTimeout(500)
    await expect(seek).toHaveValue(paused)
  })

  test('shows the real clip player with an AI label when the server has a clip', async ({
    page,
  }) => {
    await page.route('**/media/video/manifest.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          'viral-dance': {
            src: '/media/video/viral-dance.mp4',
            poster: '',
            ratio: '9:16',
            seconds: 5,
            withMusic: true,
          },
        }),
      }),
    )
    await page.route('**/media/photos/manifest.json', (route) =>
      route.fulfill({ status: 404, body: 'not found' }),
    )
    await page.goto('/video/viral-dance', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Демо-ролик «Вирусный танец»')).toBeVisible()
    await expect(page.getByText('Создано ИИ')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Включить звук' })).toBeVisible()
  })
})
