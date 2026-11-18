import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const photo = readFileSync(new URL('../src/assets/playground/portrait-day.jpg', import.meta.url))

const me = (role: 'admin' | 'user') => ({
  user: {
    id: 'u'.repeat(24),
    name: 'Тест',
    email: 'test@example.com',
    role,
    balance: 30,
    refCode: 'abc1234',
    providers: [],
    hasPassword: true,
  },
  prices: { photo: 10, video: 30, animate5: 8, animate10: 15 },
  bonuses: { signup: 30, daily: 10, referrer: 20, invitee: 10 },
  referralUrl: 'https://creator.siteaccess.ru/?ref=abc1234',
})

const limits = {
  telegram: { text: 4096, caption: 1024, media: 10, photo: 10485760, video: 52428800 },
  max: { text: 4000, media: 12, photo: 52428800, video: 262144000 },
  post: { media: 10, body: 272629760 },
}

async function json(page: Page, url: string, body: unknown) {
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

test.describe('admin publications', () => {
  test('composes a gallery post with a button and shows the result', async ({ page }) => {
    await json(page, '**/api/me', me('admin'))
    await json(page, '**/api/admin/stats', {
      users: 1,
      usersToday: 0,
      jobsToday: 0,
      queued: 0,
      running: 0,
      failedToday: 0,
      spentToday: 0,
    })
    await json(page, '**/api/admin/channels', {
      channels: [
        {
          id: 'telegram:-100500',
          platform: 'telegram',
          chatId: '-100500',
          title: 'Studio',
          username: 'neeklo_ai',
          canPost: true,
        },
        { id: 'max:-7001', platform: 'max', chatId: '-7001', title: 'Канал MAX', canPost: true },
      ],
      limits,
    })
    let sent = ''
    await page.route('**/api/admin/posts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ posts: [] }),
        })
        return
      }
      sent = route.request().postDataBuffer()?.toString('latin1') ?? ''
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p1',
          status: 'sent',
          results: [
            {
              channel: 'telegram:-100500',
              title: 'Studio',
              platform: 'telegram',
              ok: true,
              url: 'https://t.me/neeklo_ai/5',
            },
            { channel: 'max:-7001', title: 'Канал MAX', platform: 'max', ok: true },
          ],
        }),
      })
    })

    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Публикации' }).click()
    await expect(page.getByRole('heading', { name: 'Новый пост' })).toBeVisible()
    await expect(page.getByLabel('Telegram · Studio')).toBeChecked()

    // Слишком длинный для MAX текст блокирует публикацию.
    await page.getByPlaceholder('Текст поста').fill('а'.repeat(4001))
    await expect(page.getByText('MAX: текст длиннее 4000 символов')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Опубликовать' })).toBeDisabled()

    await page.getByPlaceholder('Текст поста').fill('**Новое** в студии')
    await page.locator('input[type=file]').setInputFiles([
      { name: 'a.jpg', mimeType: 'image/jpeg', buffer: photo },
      { name: 'b.jpg', mimeType: 'image/jpeg', buffer: photo },
    ])
    await expect(page.getByText('Фото и видео · 2 / 10', { exact: false })).toBeVisible()
    await page.getByLabel('Кнопка под постом (необязательно)').fill('Открыть студию')
    await page.getByLabel('Ссылка кнопки').fill('https://creator.siteaccess.ru')
    await expect(
      page.getByText('к альбому кнопку прикрепить нельзя', { exact: false }),
    ).toBeVisible()
    await noOverflow(page)

    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    await expect(page.getByRole('link', { name: 'открыть' })).toHaveAttribute(
      'href',
      'https://t.me/neeklo_ai/5',
    )
    expect(sent).toContain('name="buttonUrl"')
    expect(sent.match(/name="files"/g)).toHaveLength(2)
    expect(sent.match(/name="channels"/g)).toHaveLength(2)
  })

  test('mini-app cabinet: no logout, share opens the Telegram chat picker', async ({ page }) => {
    await json(page, '**/api/me', me('user'))
    await json(page, '**/api/tariffs', { tariffs: [] })
    await json(page, '**/api/wallet', { history: [] })
    await json(page, '**/api/jobs', { jobs: [] })
    await json(page, '**/api/auth/providers', { providers: [] })
    await page.route('https://telegram.org/js/telegram-web-app.js*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.__opened = []; window.Telegram = { WebApp: { initData: '', ready() {}, expand() {}, close() {},
          openTelegramLink(u) { window.__opened.push(u) }, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }`,
      }),
    )
    await page.goto('/telegram/cabinet', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Тест' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Пригласить друзей' }).click()
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatch(
      /^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Fcreator\.siteaccess\.ru%2F%3Fref%3Dabc1234&text=/,
    )

    // В браузере кнопка выхода на месте.
    await page.goto('/cabinet', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
  })

  test('autopost: settings, draft review and publish', async ({ page }) => {
    await json(page, '**/api/me', me('admin'))
    await json(page, '**/api/admin/stats', {
      users: 1,
      usersToday: 0,
      jobsToday: 0,
      queued: 0,
      running: 0,
      failedToday: 0,
      spentToday: 0,
    })
    await page.route(/\/media\/autopost\//, (route) =>
      route.fulfill({ contentType: 'image/jpeg', body: photo }),
    )
    await json(page, '**/api/admin/channels', {
      channels: [
        {
          id: 'telegram:-100500',
          platform: 'telegram',
          chatId: '-100500',
          title: 'Studio',
          canPost: true,
        },
      ],
      limits,
    })
    const settings = {
      enabled: false,
      intervalMin: 60,
      from: '09:00',
      to: '21:00',
      kinds: { photo: true, video: true },
      channels: [],
      autoPublish: true,
      buttonText: '⚡ Сгенерировать ⚡',
      llmModel: 'qwen3.6-128k:latest',
    }
    const draft = {
      id: 'abc12345xyz',
      kind: 'photo',
      storyId: 'peony-gold',
      storyTitle: 'Пионы и золото',
      status: 'draft',
      text: 'Пионы и золото 🤍\n\nНовый сюжет: **белые пионы**.\n\n📸 Жми на кнопку ниже↓',
      media: [0, 1, 2, 3].map((i) => ({
        kind: 'photo',
        src: `/media/autopost/abc12345xyz/${i}.jpg`,
        thumb: `/media/autopost/abc12345xyz/${i}-thumb.webp`,
      })),
      button: {
        text: '⚡ Сгенерировать ⚡',
        url: 'https://creator.siteaccess.ru/photos/peony-gold',
      },
      results: [],
      createdAt: Date.now(),
    }
    let saved: Record<string, unknown> = {}
    let published = false
    await page.route('**/api/admin/autopost', async (route) => {
      if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          settings: { ...settings, ...saved },
          running: false,
          nextAt: saved.enabled ? Date.now() + 3_600_000 : undefined,
          items: [draft],
        }),
      })
    })
    await page.route('**/api/admin/autopost/abc12345xyz/publish', async (route) => {
      published = true
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: { ...settings, ...saved },
          running: false,
          items: [{ ...draft, status: 'publishing' }],
        }),
      })
    })

    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Автопостинг' }).click()
    await expect(page.getByRole('heading', { name: 'Агент публикаций' })).toBeVisible()
    await page.getByText('Агент включён', { exact: true }).click()
    await expect(page.getByLabel('Агент включён')).toBeChecked()
    await page.getByLabel('Как часто').selectOption('120')
    await page.getByLabel('Публиковать с (МСК)').fill('10:00')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Агент включён', { exact: true }).last()).toBeVisible()
    expect(saved).toMatchObject({ enabled: true, intervalMin: 120, from: '10:00', to: '21:00' })
    await expect(page.getByText('Следующий пост — около')).toBeVisible()

    await expect(page.getByLabel('Текст черновика')).toHaveValue(draft.text)
    await expect(page.locator('img[src$="-thumb.webp"]')).toHaveCount(4)
    await noOverflow(page)
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click()
    await expect(page.getByText('Публикуется', { exact: false })).toBeVisible()
    expect(published).toBe(true)
  })

  test('home: subscribe bonus and invite cards', async ({ page }) => {
    let balance = 30
    await page.route('**/api/me', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...me('user'), user: { ...me('user').user, balance } }),
      }),
    )
    let claimed = false
    const rewards = () => ({
      amount: 100,
      invitee: 10,
      referrer: 20,
      channels: [
        {
          id: 'telegram:-100500',
          platform: 'telegram',
          title: 'Studio',
          url: 'https://t.me/neeklo_ai',
          claimed,
        },
      ],
      linked: { telegram: true, max: false },
    })
    await page.route('**/api/rewards', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(rewards()) }),
    )
    await page.route('**/api/rewards/subscribe', async (route) => {
      claimed = true
      balance = 130
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...rewards(), credited: 100 }),
      })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /Подпишитесь на канал — 100 токенов/ }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: /Делитесь ссылкой/ })).toBeVisible()
    await expect(page.getByText('https://creator.siteaccess.ru/?ref=abc1234').first()).toBeVisible()
    await noOverflow(page)
    await page.getByRole('button', { name: 'Я подписался' }).first().click()
    await expect(page.getByText('Готово! +100 токенов на балансе').first()).toBeVisible()
    await expect(page.getByText('Бонус уже получен', { exact: false }).first()).toBeVisible()
  })
})
