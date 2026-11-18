import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/syne/wght.css'
import '@fontsource-variable/outfit/wght.css'
import './styles/global.css'
import { App } from './app/app.tsx'
import { loadHostSdk } from './features/platform/load-sdk.ts'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root is missing')
}

// В мини-приложениях Telegram и MAX сначала загружается их библиотека, затем приложение.
void loadHostSdk().then(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
