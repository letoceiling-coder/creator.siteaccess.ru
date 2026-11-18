import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AppFrame } from '@/components/layout/app-frame.tsx'
import {
  AnimatePage,
  CabinetPage,
  CatalogPage,
  CreatePage,
  CustomCreatePage,
  CustomPage,
  HomePage,
  JobPage,
  LoginPage,
  TelegramAuthPage,
  ScenarioPage,
  VideoCreatePage,
  VideoItemPage,
  VideoPage,
} from '@/pages/studio/routes.tsx'
import { ShellPage } from '@/pages/shell-page.tsx'

const AdminPage = lazy(() =>
  import('@/pages/admin/admin-page.tsx').then((module) => ({ default: module.AdminPage })),
)

const FoundationPage = lazy(() =>
  import('@/pages/foundation-page.tsx').then((module) => ({
    default: module.FoundationPage,
  })),
)

/** Одно приложение, три корня: браузер, Telegram, MAX. Хвосты адреса общие. */
const bases = ['', '/telegram', '/max'] as const
const tails = [
  ['', HomePage],
  ['/photos', CatalogPage],
  ['/photos/:id', ScenarioPage],
  ['/photos/:id/create', CreatePage],
  ['/jobs/:id', JobPage],
  ['/video', VideoPage],
  ['/video/animate', AnimatePage],
  ['/video/:id', VideoItemPage],
  ['/video/:id/create', VideoCreatePage],
  ['/cabinet', CabinetPage],
  ['/custom', CustomPage],
  ['/custom/:id', CustomPage],
  ['/custom/:id/create', CustomCreatePage],
  ['/login', LoginPage],
] as const

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppFrame />}>
        {bases.flatMap((base) =>
          tails.map(([tail, Page]) => (
            <Route key={base + tail} path={base + tail || '/'} element={<Page />} />
          )),
        )}
        <Route path="/auth/telegram" element={<TelegramAuthPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/dev/shell" element={<ShellPage />} />
        <Route path="/dev/foundation" element={<FoundationPage />} />
        <Route path="*" element={<ShellPage unknown />} />
      </Route>
    </Routes>
  )
}
