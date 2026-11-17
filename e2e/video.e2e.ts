import { expect, test } from '@playwright/test'

test.describe('video templates', () => {
  test('plays the storyboard preview and pauses it', async ({ page }) => {
    await page.goto('/video/neon-roof', { waitUntil: 'domcontentloaded' })
    const seek = page.getByRole('slider', { name: 'Перемотка' })
    await expect(seek).toHaveValue('0')
    await page.getByRole('button', { name: 'Смотреть превью' }).click()
    await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(0.5)
    await page.getByRole('button', { name: 'Пауза' }).click()
    const paused = await seek.inputValue()
    await page.waitForTimeout(500)
    await expect(seek).toHaveValue(paused)
  })
})
