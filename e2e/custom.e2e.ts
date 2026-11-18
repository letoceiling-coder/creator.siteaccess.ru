import { expect, test, type Page } from '@playwright/test'

const me = {
  user: {
    id: 'u'.repeat(24),
    name: 'Тест',
    email: 'test@example.com',
    role: 'user',
    balance: 100,
    refCode: 'abc1234',
    providers: [],
    hasPassword: true,
  },
  prices: { photo: 10, video: 30, animate5: 8, animate10: 15, song: 15 },
  bonuses: { signup: 30, daily: 10, referrer: 20, invitee: 10, subscribe: 100 },
  referralUrl: 'https://creator.siteaccess.ru/?ref=abc1234',
}

const id = 'a1b2c3d4e5f60718'
const photoPlan = (title: string) => ({
  title,
  summary: 'Прогулка у моря в солнечный день.',
  shots: [1, 2, 3, 4].map((i) => ({ ru: `Кадр ${i}: у самой воды` })),
})

async function json(page: Page, url: string | RegExp, body: unknown, status = 200) {
  await page.route(url, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

test.describe('custom story agent', () => {
  test('photo: idea, refusal, plan, revision, approval, upload step', async ({ page }) => {
    await json(page, '**/api/me', me)
    await json(page, '**/api/rewards', {
      amount: 0,
      invitee: 10,
      referrer: 20,
      channels: [],
      linked: { telegram: false, max: false },
    })
    let state = {
      id,
      kind: 'photo',
      status: 'proposed',
      plan: photoPlan('Утро у моря'),
      messages: [
        { role: 'user', text: 'прогулка у моря' },
        { role: 'agent', text: 'Добавил золотой свет и прогулку вдоль воды.' },
      ],
      cost: 10,
      createdAt: Date.now(),
    }
    let attempts = 0
    await page.route('**/api/scenarios', async (route) => {
      attempts += 1
      const body = route.request().postDataJSON()
      if (attempts === 1) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error:
              'Студия не создаёт откровенные и эротические сюжеты, бельё и наготу. Опишите другую идею.',
          }),
        })
        return
      }
      expect(body).toEqual({ kind: 'photo', idea: 'прогулка у моря' })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(state),
      })
    })
    await page.route(`**/api/scenarios/${id}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) }),
    )
    await page.route(`**/api/scenarios/${id}/reply`, async (route) => {
      state = {
        ...state,
        plan: photoPlan('Море на закате'),
        messages: [
          ...state.messages,
          { role: 'user', text: route.request().postDataJSON().text },
          { role: 'agent', text: 'Перенёс съёмку на закат.' },
        ],
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) })
    })
    await page.route(`**/api/scenarios/${id}/approve`, async (route) => {
      state = { ...state, status: 'approved' }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) })
    })

    await page.goto('/custom', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: 'Опишите идею — агент сделает сценарий' }),
    ).toBeVisible()
    await noOverflow(page)
    await page.getByPlaceholder(/ночному Токио/).fill('фото в белье')
    await page.getByRole('button', { name: 'Отправить агенту' }).click()
    await expect(page.getByText(/не создаёт откровенные/)).toBeVisible()

    await page.getByPlaceholder(/ночному Токио/).fill('прогулка у моря')
    await page.getByRole('button', { name: 'Отправить агенту' }).click()
    await expect(page).toHaveURL(new RegExp(`/custom/${id}$`))
    await expect(page.getByRole('heading', { name: 'Утро у моря' })).toBeVisible()
    await expect(page.getByText('Кадр 4: у самой воды')).toBeVisible()

    await page.getByPlaceholder(/больше снега/).fill('пусть будет закат')
    await page.getByRole('button', { name: 'Отправить правку' }).click()
    await expect(page.getByRole('heading', { name: 'Море на закате' })).toBeVisible()
    await expect(page.getByText('Перенёс съёмку на закат.')).toBeVisible()
    await noOverflow(page)

    await page.getByRole('button', { name: 'Согласовать и загрузить фото' }).click()
    await expect(page).toHaveURL(new RegExp(`/custom/${id}/create$`))
    await expect(page.getByRole('heading', { name: 'Ваши фото' })).toBeVisible()
  })

  test('song: agent asks, chips, approval starts the job', async ({ page }) => {
    await json(page, '**/api/me', me)
    let created = ''
    const song = {
      id,
      kind: 'song',
      status: 'proposed',
      plan: {
        title: 'Мама',
        summary: 'Тёплая поп-песня о маме.',
        genre: 'поп',
        bpm: 96,
        language: 'ru',
        vocal: 'female',
        lyrics: '[Verse 1]\nУтро тёплое в окне\n[Chorus]\nМама, мама, свет в окне',
      },
      messages: [
        { role: 'user', text: 'песня про маму. Жанр: поп.' },
        { role: 'agent', text: 'Вот текст и звучание.' },
      ],
      cost: 15,
      createdAt: Date.now(),
    }
    await page.route('**/api/scenarios', async (route) => {
      created = route.request().postDataJSON().idea
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(song),
      })
    })
    await page.route(`**/api/scenarios/${id}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(song) }),
    )
    await json(page, `**/api/scenarios/${id}/approve`, { ...song, status: 'approved' })
    let jobForm = ''
    await page.route('**/api/jobs', async (route) => {
      jobForm = route.request().postData() ?? ''
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'j'.repeat(32), position: 1, cost: 15 }),
      })
    })
    await json(page, `**/api/jobs/${'j'.repeat(32)}`, {
      id: 'j'.repeat(32),
      kind: 'song',
      target: `s-${id}`,
      status: 'done',
      done: 1,
      total: 1,
      position: 0,
      results: [
        {
          type: 'audio',
          src: '/media/jobs/x/song.mp3',
          download: '/media/jobs/x/song.mp3',
          label: 'Мама',
          text: song.plan.lyrics,
          width: 0,
          height: 0,
        },
      ],
      cost: 15,
      createdAt: Date.now(),
    })

    await page.goto('/custom', { waitUntil: 'domcontentloaded' })
    await page.getByRole('radio', { name: /Песня/ }).click()
    await page.getByPlaceholder(/поздравление для мамы/).fill('песня про маму')
    await page.getByRole('button', { name: 'поп', exact: true }).click()
    await page.getByRole('button', { name: 'Отправить агенту' }).click()
    expect(created).toBe('песня про маму. Жанр: поп.')
    await expect(page.getByText('Мама, мама, свет в окне')).toBeVisible()
    await page.getByRole('button', { name: /Согласовать и создать песню · 15/ }).click()
    await expect(page).toHaveURL(/\/jobs\/j+$/)
    expect(jobForm).toContain('name="kind"\r\n\r\nsong')
    await expect(page.getByRole('heading', { name: 'Ваша песня' })).toBeVisible()
    await expect(page.locator('audio')).toHaveAttribute('src', '/media/jobs/x/song.mp3')
  })
})
