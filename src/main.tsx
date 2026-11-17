import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/syne/wght.css'
import '@fontsource-variable/outfit/wght.css'
import './styles/global.css'
import { App } from './app/app.tsx'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root is missing')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
