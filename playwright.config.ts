import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5173'

const chromium = { browserName: 'chromium' as const }

const projects: PlaywrightTestConfig['projects'] = [
  {
    name: 'mobile-320',
    use: { ...chromium, viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true },
  },
  {
    name: 'mobile-360',
    use: { ...chromium, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
  },
  {
    name: 'mobile-390',
    use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  },
  {
    name: 'mobile-430',
    use: { ...chromium, viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  },
  {
    name: 'tablet-768',
    use: { ...chromium, viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
  },
  {
    name: 'desktop-1024',
    use: { ...chromium, viewport: { width: 1024, height: 768 } },
  },
  {
    name: 'desktop-1280',
    use: { ...chromium, viewport: { width: 1280, height: 800 } },
  },
  {
    name: 'wide-1536',
    use: { ...chromium, viewport: { width: 1536, height: 960 } },
  },
]

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
})
