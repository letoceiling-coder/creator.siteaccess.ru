import { AppProviders } from './providers.tsx'
import { AppRoutes } from './router.tsx'

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
