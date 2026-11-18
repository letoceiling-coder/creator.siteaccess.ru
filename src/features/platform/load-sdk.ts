/**
 * Библиотеки мини-приложений: без них внутри Telegram и MAX нет window.Telegram.WebApp /
 * window.WebApp, и сайт ведёт себя как обычный браузер. Загружаются только там, где нужны:
 * по пути /telegram, /max или по подписанным данным во фрагменте адреса.
 */
const sources = {
  telegram: 'https://telegram.org/js/telegram-web-app.js',
  max: 'https://st.max.ru/js/max-web-app.js',
} as const

export type HostKind = keyof typeof sources

export function detectHost(pathname: string, hash: string): HostKind | undefined {
  if (hash.includes('tgWebAppData')) return 'telegram'
  if (hash.includes('WebAppData')) return 'max'
  if (pathname === '/telegram' || pathname.startsWith('/telegram/')) return 'telegram'
  if (pathname === '/max' || pathname.startsWith('/max/')) return 'max'
  return undefined
}

/** Подписанные данные запуска из фрагмента адреса — если библиотека не загрузилась. */
export function initDataFromHash(kind: HostKind, hash: string): string | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get(kind === 'telegram' ? 'tgWebAppData' : 'WebAppData') ?? undefined
}

export function loadHostSdk(timeoutMs = 2500): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const kind = detectHost(window.location.pathname, window.location.hash)
  if (!kind) return Promise.resolve()
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = sources[kind]
    script.async = true
    const done = () => resolve()
    script.onload = done
    script.onerror = done
    document.head.appendChild(script)
    // Сеть медленная или библиотека недоступна — приложение всё равно стартует.
    window.setTimeout(done, timeoutMs)
  })
}
