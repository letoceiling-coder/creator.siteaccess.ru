import { createContext, useContext } from 'react'
import { z } from 'zod'
import { apiFetch, jsonInit, parse } from './http.ts'

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().optional(),
    avatar: z.string().optional(),
    role: z.enum(['user', 'admin']),
    balance: z.number(),
    refCode: z.string(),
    providers: z.array(z.string()),
    hasPassword: z.boolean(),
  }),
  prices: z.object({
    photo: z.number(),
    video: z.number(),
    animate5: z.number(),
    animate10: z.number(),
    song: z.number().optional(),
  }),
  bonuses: z.object({
    signup: z.number(),
    daily: z.number(),
    referrer: z.number(),
    invitee: z.number(),
    subscribe: z.number().optional(),
  }),
  referralUrl: z.string(),
})

export type Me = z.infer<typeof meSchema>

export interface Session {
  status: 'loading' | 'guest' | 'user'
  me?: Me
  refresh: () => Promise<void>
  setMe: (me: Me | undefined) => void
  logout: () => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession: нет SessionProvider')
  return value
}

export async function fetchMe(): Promise<Me | undefined> {
  const res = await apiFetch('/api/me', { cache: 'no-store' })
  const data = await parse(res, z.object({ user: z.unknown() }).passthrough())
  if (!data.user) return undefined
  return meSchema.parse(data)
}

/* ── Код приглашения из ссылки ?ref= живёт до регистрации ── */

const refKey = 'creator.ref'

export function rememberRef(search: string) {
  const ref = new URLSearchParams(search).get('ref')
  if (!ref || !/^[\w-]{3,16}$/.test(ref)) return
  try {
    window.localStorage.setItem(refKey, ref)
  } catch {
    // хранилище недоступно — бонус по ссылке не сохранится, вход всё равно работает
  }
}

export function savedRef(): string | undefined {
  try {
    return window.localStorage.getItem(refKey) ?? undefined
  } catch {
    return undefined
  }
}

export async function login(email: string, password: string) {
  return parse(await apiFetch('/api/auth/login', jsonInit('POST', { email, password })), meSchema)
}

export async function register(email: string, password: string, name: string) {
  return parse(
    await apiFetch(
      '/api/auth/register',
      jsonInit('POST', { email, password, name, ref: savedRef() }),
    ),
    meSchema,
  )
}

export async function loginWebApp(platform: 'telegram' | 'max', initData: string) {
  return parse(
    await apiFetch('/api/auth/webapp', jsonInit('POST', { platform, initData, ref: savedRef() })),
    meSchema,
  )
}

export async function loginTelegram(data: Record<string, unknown>) {
  return parse(
    await apiFetch('/api/auth/telegram', jsonInit('POST', { data, ref: savedRef() })),
    meSchema,
  )
}

export const providersSchema = z.object({
  providers: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
  webapp: z.object({ telegram: z.boolean(), max: z.boolean() }),
})

export async function fetchProviders() {
  return parse(await apiFetch('/api/auth/providers'), providersSchema)
}

/** Стоимость задачи по ценам из профиля. */
export function priceOf(
  me: Me | undefined,
  kind: 'photo' | 'video' | 'animate' | 'song',
  duration?: number,
) {
  if (!me) return undefined
  if (kind === 'song') return me.prices.song ?? 15
  if (kind === 'video') return me.prices.video
  if (kind === 'animate') return duration === 10 ? me.prices.animate10 : me.prices.animate5
  return me.prices.photo
}
