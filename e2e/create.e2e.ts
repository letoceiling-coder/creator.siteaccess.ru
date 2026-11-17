import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const photo = readFileSync(new URL('../src/assets/playground/portrait-day.jpg', import.meta.url))
const jobId = 'a'.repeat(32)

/** Подменяет API: задача сначала в очереди, на втором запросе готова. */
async function mockApi(page: Page) {
  const uploads: string[] = []
  let polls = 0
  await page.route(/\/media\/(photos|video)\//, (route) => route.fulfill({ status: 404, body: '' }))
  await page.route(/\/media\/jobs\//, (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  )
  await page.route('**/api/jobs', async (route) => {
    uploads.push(route.request().postData() ?? '')
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: jobId, token: 'secret-token', position: 1 }),
    })
  })
  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer secret-token')
    polls += 1
    const done = polls > 1
    const results = Array.from({ length: 5 }, (_, i) => ({
      type: 'photo',
      src: `/media/jobs/${jobId}/${i + 1}.webp`,
      download: `/media/jobs/${jobId}/${i + 1}.jpg`,
      width: 1104,
      height: 1472,
    }))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        kind: 'photo',
        target: 'north',
        status: done ? 'done' : 'queued',
        done: done ? 5 : 0,
        total: 5,
        position: done ? 0 : 1,
        results: done ? results : [],
        createdAt: Date.now(),
      }),
    })
  })
  return uploads
}

test.describe('create a photo session', () => {
  test('uploads photos, sends the job and shows the result', async ({ page }) => {
    const uploads = await mockApi(page)
    await page.goto('/photos/north/create', { waitUntil: 'domcontentloaded' })
    const next = page.getByRole('button', { name: 'Дальше' })
    await expect(next).toBeDisabled()

    // неподходящий файл отклоняется до отправки
    await page.getByTestId('photo-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    await expect(page.getByRole('alert')).toContainText('JPEG, PNG и WebP')

    await page.getByTestId('photo-input').setInputFiles({
      name: 'me.jpg',
      mimeType: 'image/jpeg',
      buffer: photo,
    })
    await expect(page.getByRole('img', { name: 'Фото 1' })).toBeVisible()
    await next.click()
    await page.getByRole('radio', { name: 'Тёмное пальто' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()

    const create = page.getByRole('button', { name: 'Создать' })
    await expect(create).toBeDisabled()
    await page.getByText('Это мои фото').click()
    await create.click()

    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`))
    expect(uploads[0]).toContain('name="outfit"\r\n\r\n2')
    expect(uploads[0]).toContain('name="consent"\r\n\r\nyes')
    expect(uploads[0]).toContain('filename="me.jpg"')

    await expect(page.getByRole('heading', { name: 'Северный берег' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('link', { name: /Скачать кадр/ })).toHaveCount(5)

    await page.goto('/cabinet', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Северный берег/ })).toBeVisible()
  })

  test('animates an own photo: one photo, motion and duration', async ({ page }) => {
    const uploads = await mockApi(page)
    await page.goto('/video', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Оживить своё фото/ }).click()
    await expect(page).toHaveURL(/\/video\/animate$/)
    await page.getByTestId('photo-input').setInputFiles({
      name: 'old.jpg',
      mimeType: 'image/jpeg',
      buffer: photo,
    })
    await expect(page.getByRole('button', { name: 'Выбрать фото' })).toBeDisabled()
    await page.getByRole('button', { name: 'Дальше' }).click()
    await expect(page.getByRole('heading', { name: 'Движение' })).toBeVisible()
    await page.getByRole('radio', { name: /Ветер/ }).click()
    await page.getByRole('tab', { name: '10 секунд' }).click()
    await page.getByRole('button', { name: 'Дальше' }).click()
    await expect(page.getByText('10 с', { exact: true })).toBeVisible()
    await page.getByText('Это мои фото').click()
    await page.getByRole('button', { name: 'Создать' }).click()
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`))
    expect(uploads[0]).toContain('name="kind"\r\n\r\nanimate')
    expect(uploads[0]).toContain('name="target"\r\n\r\nwind')
    expect(uploads[0]).toContain('name="duration"\r\n\r\n10')
  })

  test('opens the video wizard from a template', async ({ page }) => {
    await mockApi(page)
    await page.goto('/video/coast-run', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Создать со своим фото' }).click()
    await expect(page).toHaveURL(/\/video\/coast-run\/create$/)
    await expect(page.getByRole('heading', { name: 'Ваши фото' })).toBeVisible()
  })
})
