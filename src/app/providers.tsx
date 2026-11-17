import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { ToastProvider } from '@/components/ui/toast-provider.tsx'
import { PlatformProvider } from '@/features/platform/platform-provider.tsx'
import { ThemeProvider } from './theme-provider.tsx'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <PlatformProvider>
          <ToastProvider>{children}</ToastProvider>
        </PlatformProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
