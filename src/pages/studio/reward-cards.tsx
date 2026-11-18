import { Gift, Send, Share2, UserPlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { heroDeck } from '@/features/catalog/data.ts'
import { ApiError, apiFetch, jsonInit, parse } from '@/features/auth/http.ts'
import { useSession } from '@/features/auth/session.ts'
import { useMedia } from '@/features/media/use-media.ts'
import { usePlatform } from '@/features/platform/use-platform.ts'
import { usePaths } from '@/features/platform/use-paths.ts'
import { cn } from '@/shared/cn.ts'

const rewardsSchema = z.object({
  amount: z.number(),
  invitee: z.number(),
  referrer: z.number(),
  channels: z.array(
    z.object({
      id: z.string(),
      platform: z.enum(['telegram', 'max']),
      title: z.string(),
      url: z.string(),
      claimed: z.boolean(),
    }),
  ),
  linked: z.object({ telegram: z.boolean(), max: z.boolean() }),
  credited: z.number().optional(),
})
type Rewards = z.infer<typeof rewardsSchema>

const platformName = { telegram: 'Telegram', max: 'MAX' } as const
const enter = { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const }

/** Обложка из каталога студии (новые сюжеты с героем в кадре), иначе — кадр из комплекта сайта. */
function useCover(n: number, fallback: string) {
  const media = useMedia()
  const covers = Object.values(media.photoStories)
    .map((s) => s.cover)
    .filter((c) => c.includes('/photo-stories/'))
  return covers.length ? (covers[(n * 7) % covers.length] ?? fallback) : fallback
}

function useRewards() {
  const session = useSession()
  const [data, setData] = useState<Rewards>()
  const userId = session.me?.user.id
  const load = useCallback(() => {
    apiFetch('/api/rewards', { cache: 'no-store' })
      .then((res) => parse(res, rewardsSchema))
      .then(setData)
      .catch(() => setData(undefined))
  }, [])
  // Перезагрузка после входа: появляется привязка к мессенджеру и отметки «получено».
  useEffect(load, [load, userId])
  return { data, setData }
}

/** Фото-обложка карточки бонуса: кадр студии с плашкой награды. */
function PhotoBadge({ src, badge, tilt }: { src: string; badge: string; tilt?: string }) {
  return (
    <div className="relative min-h-56 overflow-hidden sm:min-h-full">
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn('absolute inset-0 size-full object-cover object-[50%_22%]', tilt)}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <span className="chamfer-sm bg-accent-fill text-accent-ink font-display absolute bottom-3 left-3 px-3 py-1.5 text-xl tabular-nums">
        {badge}
      </span>
    </div>
  )
}

/** «Подпишитесь на канал — получите токены»: проверка подписки через бота студии. */
export function SubscribeCard({ className }: { className?: string }) {
  const session = useSession()
  const platform = usePlatform()
  const paths = usePaths()
  const navigate = useNavigate()
  const { data, setData } = useRewards()
  const cover = useCover(1, heroDeck[1] ?? '')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({})

  if (!data || data.amount <= 0 || data.channels.length === 0) return null
  // В мини-приложении показываем канал своего мессенджера первым.
  const channels = [...data.channels].sort(
    (a, b) => Number(b.platform === platform.id) - Number(a.platform === platform.id),
  )
  const allClaimed = channels.every((c) => c.claimed)

  async function check(id: string) {
    setBusy(id)
    setMessage({})
    try {
      const res = await apiFetch('/api/rewards/subscribe', jsonInit('POST', { channelId: id }))
      const next = await parse(res, rewardsSchema)
      setData(next)
      setMessage({ ok: `Готово! +${next.credited ?? data!.amount} токенов на балансе` })
      await session.refresh()
    } catch (e) {
      setMessage({ error: e instanceof ApiError ? e.message : 'Не удалось проверить подписку' })
    } finally {
      setBusy('')
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={enter}
      className={cn(
        'chamfer ticks grain bg-canvas-raised grid overflow-hidden sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]',
        className,
      )}
    >
      <PhotoBadge src={cover} badge={`+${data.amount}`} />
      <div className="grid min-w-0 content-start gap-3 p-5">
        <span className="text-caption tracking-label text-accent flex items-center gap-2 uppercase">
          <Send size={14} aria-hidden="true" /> Бонус за подписку
        </span>
        <h3 className="font-display text-ink text-xl text-balance">
          Подпишитесь на канал — {data.amount} токенов в подарок
        </h3>
        <p className="text-body text-ink-muted">
          Новые сюжеты, идеи образов и лучшие кадры студии. Токены придут сразу после проверки
          подписки.
        </p>
        {allClaimed ? (
          <p className="text-body text-success">Бонус уже получен — спасибо, что с нами!</p>
        ) : (
          <ul className="grid gap-2">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2">
                <StudioButton
                  variant="outline"
                  className="min-w-0 flex-1 basis-40 px-4"
                  onClick={() => platform.adapter.openLink(c.url)}
                >
                  Открыть канал в {platformName[c.platform]}
                </StudioButton>
                {c.claimed ? (
                  <span className="text-caption text-success self-center">Получено</span>
                ) : session.me ? (
                  <StudioButton
                    className="min-w-0 flex-1 basis-40 px-4"
                    disabled={busy !== ''}
                    onClick={() => void check(c.id)}
                  >
                    {busy === c.id ? 'Проверяем…' : 'Я подписался'}
                  </StudioButton>
                ) : (
                  <StudioButton
                    className="min-w-0 flex-1 basis-40 px-4"
                    onClick={() =>
                      void navigate(
                        `${paths.login}?return=${encodeURIComponent(location.pathname)}`,
                      )
                    }
                  >
                    Войти и получить
                  </StudioButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {session.me && !allClaimed && !channels.some((c) => data.linked[c.platform]) ? (
          <p className="text-caption text-ink-muted">
            Проверка идёт через бота студии — для этого войдите через{' '}
            {channels.map((c) => platformName[c.platform]).join(' или ')}.
          </p>
        ) : null}
        {message.ok ? (
          <p role="status" className="text-body text-success">
            {message.ok}
          </p>
        ) : null}
        {message.error ? (
          <p role="alert" className="text-caption text-danger">
            {message.error}
          </p>
        ) : null}
      </div>
    </motion.article>
  )
}

/** «Пригласите друга»: ссылка-приглашение и отправка через мессенджер. */
export function InviteCard({ className }: { className?: string }) {
  const session = useSession()
  const platform = usePlatform()
  const paths = usePaths()
  const navigate = useNavigate()
  const { data } = useRewards()
  const cover = useCover(4, heroDeck[2] ?? '')
  const [copied, setCopied] = useState(false)
  const me = session.me
  const invitee = me?.bonuses.invitee ?? data?.invitee ?? 10
  const referrer = me?.bonuses.referrer ?? data?.referrer ?? 20

  async function share() {
    if (!me) return
    const text =
      'Фотосессии и видео с собой в главной роли — попробуй, по ссылке будут бонусные токены'
    try {
      if (await platform.adapter.share(text, me.referralUrl)) return
      if (navigator.share) {
        await navigator.share({ title: 'AI Creative Studio', text, url: me.referralUrl })
        return
      }
      await navigator.clipboard.writeText(me.referralUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // пользователь закрыл окно «Поделиться»
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ ...enter, delay: 0.08 }}
      className={cn(
        'chamfer ticks grain bg-canvas-raised grid overflow-hidden sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]',
        className,
      )}
    >
      <PhotoBadge src={cover} badge={`+${referrer}`} />
      <div className="grid min-w-0 content-start gap-3 p-5">
        <span className="text-caption tracking-label text-accent flex items-center gap-2 uppercase">
          <UserPlus size={14} aria-hidden="true" /> Пригласите друга
        </span>
        <h3 className="font-display text-ink text-xl text-balance">
          Делитесь ссылкой — получайте токены за каждого друга
        </h3>
        <ul className="text-body text-ink-muted grid gap-1">
          <li className="flex items-center gap-2">
            <Gift size={16} className="text-accent shrink-0" aria-hidden="true" />
            Другу — {invitee} токенов сразу при регистрации
          </li>
          <li className="flex items-center gap-2">
            <Share2 size={16} className="text-accent shrink-0" aria-hidden="true" />
            Вам — {referrer} токенов, когда он создаст первую работу
          </li>
        </ul>
        {me ? (
          <div className="grid gap-2">
            <code className="chamfer-sm bg-canvas-sunken text-ink block min-w-0 truncate px-4 py-3 text-sm">
              {me.referralUrl}
            </code>
            <StudioButton arrow onClick={() => void share()}>
              {copied ? 'Ссылка скопирована' : 'Пригласить друзей'}
            </StudioButton>
          </div>
        ) : (
          <StudioButton
            arrow
            onClick={() =>
              void navigate(`${paths.login}?return=${encodeURIComponent(location.pathname)}`)
            }
          >
            Войти и получить ссылку
          </StudioButton>
        )}
      </div>
    </motion.article>
  )
}
