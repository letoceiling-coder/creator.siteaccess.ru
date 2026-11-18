import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const photo = readFileSync(new URL('../src/assets/playground/portrait-day.jpg', import.meta.url))
const jobId = 'c'.repeat(32)
const nextId = 'd'.repeat(32)

const me = {
  user: {
    id: 'u'.repeat(24),
    name: 'Тест',
    email: 'test@example.com',
    role: 'user',
    balance: 30,
    refCode: 'abc1234',
    providers: [],
    hasPassword: true,
  },
  prices: { photo: 10, video: 30, animate5: 8, animate10: 15, song: 15 },
  bonuses: { signup: 30, daily: 10, referrer: 20, invitee: 10 },
  referralUrl: 'https://creator.siteaccess.ru/?ref=abc1234',
}

const doneJob = (extra: object = {}) => ({
  id: jobId,
  kind: 'photo',
  target: 'north',
  status: 'done',
  done: 5,
  total: 5,
  position: 0,
  results: [1, 2, 3, 4, 5].map((i) => ({
    type: 'photo',
    src: `/media/jobs/${jobId}/${i}.webp`,
    download: `/media/jobs/${jobId}/${i}.jpg`,
    label: `Кадр ${i}`,
    width: 1104,
    height: 1472,
  })),
  cost: 10,
  canRedo: true,
  createdAt: Date.now(),
  ...extra,
})

async function base(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(me) }),
  )
  await page.route(/\/media\/jobs\//, (route) =>
    route.fulfill({ contentType: 'image/jpeg', body: photo }),
  )
}

test.describe('redo after generation', () => {
  test('choose what is wrong and which frames, redo starts a free job', async ({ page }) => {
    await base(page)
    let redoBody: unknown
    await page.route(`**/api/jobs/${jobId}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(doneJob()) }),
    )
    await page.route(`**/api/jobs/${jobId}/redo`, async (route) => {
      redoBody = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: nextId,
          diagnosis: 'Лицо на кадре 2 получилось непохожим — пересоздадим со строгой проверкой.',
        }),
      })
    })
    await page.route(`**/api/jobs/${nextId}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...doneJob({
            canRedo: false,
            isRedo: true,
            redoNote: 'Пересоздали кадр 2 со строгой проверкой лица.',
          }),
          id: nextId,
          status: 'queued',
          done: 0,
          total: 1,
          results: [],
          position: 1,
        }),
      }),
    )

    await page.goto(`/jobs/${jobId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('ИИ может ошибаться', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Переделать', exact: true }).click()
    const submit = page.getByRole('button', { name: 'Переделать бесплатно' })
    await expect(submit).toBeDisabled()
    await page.getByRole('button', { name: 'Лицо не похоже на меня' }).click()
    await page.getByRole('button', { name: 'Кадр 2', exact: true }).click()
    await page.getByPlaceholder(/разрез глаз/).fill('другой разрез глаз')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await submit.click()
    await expect(page.getByText(/непохожим — пересоздадим/)).toBeVisible()
    expect(redoBody).toEqual({ reasons: ['face'], comment: 'другой разрез глаз', frames: [1] })
    await expect(page).toHaveURL(new RegExp(`/jobs/${nextId}$`), { timeout: 10_000 })
  })

  test('download closes the free redo', async ({ page }) => {
    await base(page)
    let downloaded = false
    await page.route(`**/api/jobs/${jobId}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(doneJob({ canRedo: !downloaded, downloaded })),
      }),
    )
    await page.route(`**/api/jobs/${jobId}/downloaded`, async (route) => {
      downloaded = true
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(doneJob({ canRedo: false, downloaded: true })),
      })
    })
    await page.goto(`/jobs/${jobId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Переделать', exact: true })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Скачать кадр 1' }).click()
    await download
    await expect(page.getByText('бесплатная переделка больше недоступна')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Переделать', exact: true })).toHaveCount(0)
    expect(downloaded).toBe(true)
  })
})
