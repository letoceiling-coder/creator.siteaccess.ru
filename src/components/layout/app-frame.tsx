import { ArrowLeft, Film, Home, Images, Moon, Sun, User } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useTheme } from '@/app/use-theme.ts'
import { Dock, type DockItem } from '@/components/studio/dock.tsx'
import { IrisLoader } from '@/components/studio/iris-loader.tsx'
import { usePaths } from '@/features/platform/use-paths.ts'
import { usePlatform } from '@/features/platform/use-platform.ts'
import { cn } from '@/shared/cn.ts'

type Tab = 'home' | 'photos' | 'video' | 'cabinet'

const items: DockItem<Tab>[] = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'photos', label: 'Фото', icon: Images },
  { id: 'video', label: 'Видео', icon: Film },
  { id: 'cabinet', label: 'Кабинет', icon: User },
]

/** Хвост адреса без префикса платформы. */
function tailOf(pathname: string): string {
  const stripped = pathname.replace(/^\/(telegram|max)(?=\/|$)/, '')
  return stripped === '' ? '/' : stripped
}

function tabOf(tail: string): Tab | undefined {
  if (tail === '/') return 'home'
  if (tail === '/photos') return 'photos'
  if (tail === '/video') return 'video'
  if (tail === '/cabinet') return 'cabinet'
  return undefined
}

export function AppFrame() {
  const platform = usePlatform()
  const paths = usePaths()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const tail = tailOf(location.pathname)
  const tab = tabOf(tail)
  const dev = tail.startsWith('/dev/')
  const flow = !tab && !dev
  const miniapp = platform.reservesNavigationInset
  const showDock = Boolean(tab)

  const segment = tail.split('/')[2] ?? ''
  const backTo = /^\/photos\/[^/]+\/create$/.test(tail)
    ? paths.photo(segment)
    : /^\/video\/[^/]+\/create$/.test(tail)
      ? paths.videoItem(segment)
      : tail.startsWith('/video/')
        ? paths.video
        : tail.startsWith('/photos/')
          ? paths.photos
          : tail.startsWith('/jobs/')
            ? paths.cabinet
            : undefined

  const hrefs: Record<Tab, string> = {
    home: paths.home,
    photos: paths.photos,
    video: paths.video,
    cabinet: paths.cabinet,
  }

  return (
    <div
      className={cn(
        'bg-canvas text-ink min-h-dvh',
        showDock && 'pb-28',
        showDock && !miniapp && 'md:pb-16',
      )}
    >
      <a
        href="#content"
        className="focus:bg-canvas-raised sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2"
      >
        К содержанию
      </a>
      <header className="sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div
          className="bg-canvas/85 pointer-events-none absolute inset-0 backdrop-blur-md"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {backTo ? (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.14 }}
            >
              <Link
                to={backTo}
                className="text-ink -ml-3 inline-flex min-h-11 items-center gap-2 px-3"
              >
                <ArrowLeft size={20} aria-hidden="true" /> Назад
              </Link>
            </motion.div>
          ) : (
            <Link
              to={paths.home}
              className="font-display text-ink inline-flex items-center gap-2 text-xl"
            >
              <span className="bg-accent-fill text-accent-ink chamfer-sm grid size-7 place-items-center text-sm">
                S
              </span>
              Studio
            </Link>
          )}
          {!miniapp ? (
            <nav aria-label="Разделы сайта" className="hidden items-center gap-1 md:flex">
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={hrefs[item.id]}
                  aria-current={tab === item.id ? 'page' : undefined}
                  className={cn(
                    'chamfer-sm tracking-label text-caption inline-flex min-h-11 items-center px-4 font-medium uppercase transition-colors duration-[140ms]',
                    tab === item.id
                      ? 'bg-accent-fill text-accent-ink'
                      : 'text-ink-muted hover:text-ink hover:bg-wash',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <button
            type="button"
            className="text-ink hover:bg-wash transition-studio grid size-11 place-items-center"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" size={18} />
            ) : (
              <Moon aria-hidden="true" size={18} />
            )}
          </button>
        </div>
      </header>
      <main
        id="content"
        tabIndex={-1}
        className={cn(
          'mx-auto w-full',
          dev ? 'max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8' : 'max-w-6xl',
          flow && 'pb-40 md:pb-16',
        )}
      >
        <Suspense
          fallback={
            <div className="grid min-h-64 place-items-center">
              <IrisLoader size={48} label="Загрузка раздела" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      {showDock ? (
        <Dock
          className={miniapp ? undefined : 'md:hidden'}
          items={items}
          value={tab}
          onChange={(id) => void navigate(hrefs[id])}
        />
      ) : null}
    </div>
  )
}
