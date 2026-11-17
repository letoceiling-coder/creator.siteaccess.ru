import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Образцы лежат на сервере: в разработке берём их с боевого сайта.
    proxy: { '/media': { target: 'https://creator.siteaccess.ru', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
    maxWorkers: 1,
    isolate: false,
    pool: 'threads',
  },
})
