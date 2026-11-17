import { Link, useLocation } from 'react-router'
import { Alert } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { buttonClasses } from '@/components/ui/button-styles.ts'
import { mediaQueries } from '@/config/breakpoints.ts'
import { usePlatform } from '@/features/platform/use-platform.ts'
import type { SafeAreaInsets } from '@/features/platform/types.ts'
import { useMediaQuery } from '@/hooks/use-media-query.ts'
import { useVisualViewport } from '@/hooks/use-visual-viewport.ts'

function formatInsets(insets: SafeAreaInsets): string {
  if (insets.top === 0 && insets.right === 0 && insets.bottom === 0 && insets.left === 0) {
    return 'CSS env()'
  }
  return `${insets.top} / ${insets.right} / ${insets.bottom} / ${insets.left}`
}

export function ShellPage({ unknown = false }: { unknown?: boolean }) {
  const platform = usePlatform()
  const location = useLocation()
  const viewport = useVisualViewport()
  const tabletUp = useMediaQuery(mediaQueries.md)
  const insets = platform.adapter.getSafeAreaInsets()

  const rows = [
    { term: 'Платформа', value: platform.label, testId: 'platform-label' },
    { term: 'SDK', value: platform.sdkReady ? 'Подключён' : 'Не подключён', testId: 'sdk-state' },
    { term: 'Маршрут', value: location.pathname, testId: 'route-path' },
    { term: 'Ширина', value: `${Math.round(viewport.width)} px`, testId: 'viewport-width' },
    {
      term: 'Высота viewport',
      value: `${Math.round(viewport.height)} px`,
      testId: 'viewport-height',
    },
    {
      term: 'Компоновка',
      value: tabletUp ? 'Планшет и шире' : 'Телефон',
      testId: 'layout-mode',
    },
    { term: 'Безопасная зона', value: formatInsets(insets), testId: 'safe-area' },
  ]

  return (
    <div className="grid gap-8">
      <div className="grid max-w-2xl gap-4">
        <p className="text-caption tracking-label text-ink-muted uppercase">Engineering shell</p>
        <h1 className="font-display text-display text-ink text-balance">AI Creative Studio</h1>
        <span className="bg-accent block h-px w-10" aria-hidden="true" />
        <p className="text-body text-ink-muted">
          Общая оболочка для браузера, Telegram и MAX. Страницы продукта, каталоги, кабинет и
          генерация в эту сборку не входят.
        </p>
      </div>
      {unknown ? (
        <Alert tone="danger" title="Маршрут не найден">
          Этот адрес не подключён. Вернитесь в оболочку или откройте стенд компонентов.
        </Alert>
      ) : null}
      <dl className="divide-line border-line divide-y border-y">
        {rows.map((row) => (
          <div
            key={row.term}
            className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline"
          >
            <dt className="text-caption tracking-label text-ink-muted uppercase">{row.term}</dt>
            <dd data-testid={row.testId} className="text-body text-ink break-words">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/dev/foundation" className={buttonClasses('primary')}>
          Открыть стенд
        </Link>
        {platform.id === 'browser' ? null : (
          <Button
            variant="secondary"
            disabled={!platform.sdkReady}
            aria-describedby="host-close-hint"
            onClick={() => platform.adapter.close()}
          >
            Закрыть мини-приложение
          </Button>
        )}
      </div>
      {platform.id === 'browser' ? null : (
        <p id="host-close-hint" className="text-caption text-ink-muted max-w-2xl">
          {platform.sdkReady
            ? 'Команда закрытия уходит в адаптер хоста.'
            : 'SDK не подключён. Маршрут показывает ту же оболочку в режиме предпросмотра.'}
        </p>
      )}
    </div>
  )
}
