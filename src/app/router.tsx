import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AppFrame } from '@/components/layout/app-frame.tsx'
import {
  CabinetPage,
  CatalogPage,
  CreatePage,
  HomePage,
  JobPage,
  ScenarioPage,
  VideoItemPage,
  VideoPage,
} from '@/pages/studio/routes.tsx'
import { ShellPage } from '@/pages/shell-page.tsx'

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
  ['/video/:id', VideoItemPage],
  ['/cabinet', CabinetPage],
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
        <Route path="/dev/shell" element={<ShellPage />} />
        <Route path="/dev/foundation" element={<FoundationPage />} />
        <Route path="*" element={<ShellPage unknown />} />
      </Route>
    </Routes>
  )
}
