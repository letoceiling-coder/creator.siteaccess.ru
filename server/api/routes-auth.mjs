/** Вход, регистрация, профиль, баланс и тарифы. */
import { checkPassword } from './accounts.mjs'
import {
  pkce,
  telegramAuthorizeUrl,
  verifyTelegramLogin,
  verifyWebAppInitData,
  vkAuthorizeUrl,
  vkProfile,
  yandexAuthorizeUrl,
  yandexProfile,
} from './auth.mjs'
import {
  cookies,
  HttpError,
  rateLimiter,
  readJson,
  redirect,
  safeReturn,
  send,
  SESSION_COOKIE,
  sessionCookie,
} from './http.mjs'

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

export function authRoutes({ accounts, config, log, ipOf }) {
  // Защита от перебора паролей и массовой регистрации (значения можно поднять для тестов).
  const loginLimit = rateLimiter(config.loginLimit ?? 10, 15 * 60_000)
  const registerLimit = rateLimiter(config.registerLimit ?? 5, 60 * 60_000)
  const secure = !config.insecureCookies

  const integrations = () => accounts.getSetting('integrations')
  const ready = (p) => {
    const cfg = integrations()[p]
    if (!cfg?.enabled) return undefined
    if (p === 'yandex' || p === 'vk')
      return cfg.clientId && (p === 'vk' || cfg.clientSecret) ? cfg : undefined
    return cfg.botToken ? cfg : undefined
  }
  const redirectUri = (p) => `${config.publicUrl}/api/auth/${p}/callback`

  function login(_res, user, returnTo) {
    if (user.blocked) throw new HttpError(403, 'Аккаунт заблокирован')
    const token = accounts.createSession(user.id)
    return { 'set-cookie': sessionCookie(token, { secure }), returnTo }
  }

  function me(user) {
    const fresh = accounts.ensureDaily(user)
    return {
      user: accounts.publicUser(fresh),
      prices: accounts.getSetting('prices'),
      bonuses: accounts.getSetting('bonuses'),
      referralUrl: `${config.publicUrl}/?ref=${fresh.ref_code}`,
    }
  }

  const fail = (res, message) =>
    redirect(res, `/login?error=${encodeURIComponent(message.slice(0, 120))}`)

  return async function handleAuth(req, res, path, url, user) {
    const method = req.method

    if (method === 'GET' && path === '/api/auth/providers') {
      const out = []
      if (ready('yandex'))
        out.push({ id: 'yandex', title: 'Яндекс', url: '/api/auth/yandex/start' })
      if (ready('vk')) out.push({ id: 'vk', title: 'VK ID', url: '/api/auth/vk/start' })
      if (ready('telegram'))
        out.push({ id: 'telegram', title: 'Telegram', url: '/api/auth/telegram/start' })
      return send(res, 200, {
        providers: out,
        webapp: { telegram: Boolean(ready('telegram')), max: Boolean(ready('max')) },
        maxBotOnly: Boolean(ready('max')),
      })
    }

    if (method === 'GET' && path === '/api/me') {
      if (!user) return send(res, 200, { user: null })
      return send(res, 200, me(user))
    }

    if (method === 'POST' && path === '/api/auth/register') {
      registerLimit(ipOf(req))
      const body = await readJson(req)
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase()
      const password = String(body.password ?? '')
      const name = String(body.name ?? '').trim()
      if (!EMAIL.test(email)) throw new HttpError(400, 'Проверьте адрес почты')
      if (password.length < 8 || password.length > 128)
        throw new HttpError(400, 'Пароль — от 8 до 128 символов')
      if (!name || name.length > 80) throw new HttpError(400, 'Укажите имя')
      if (accounts.st.userByEmail.get(email))
        throw new HttpError(409, 'Такая почта уже зарегистрирована. Войдите.')
      const created = accounts.createUser({
        email,
        name,
        password,
        ref: typeof body.ref === 'string' ? body.ref.slice(0, 16) : null,
      })
      log(`регистрация ${created.id.slice(0, 8)}`)
      const { 'set-cookie': cookie } = login(res, created)
      return send(res, 201, me(created), { 'set-cookie': cookie })
    }

    if (method === 'POST' && path === '/api/auth/login') {
      loginLimit(ipOf(req))
      const body = await readJson(req)
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase()
      const found = accounts.st.userByEmail.get(email)
      if (!found || !checkPassword(String(body.password ?? ''), found.password_hash))
        throw new HttpError(401, 'Неверная почта или пароль')
      const { 'set-cookie': cookie } = login(res, found)
      return send(res, 200, me(found), { 'set-cookie': cookie })
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      accounts.endSession(cookies(req)[SESSION_COOKIE])
      return send(
        res,
        200,
        { ok: true },
        { 'set-cookie': sessionCookie('', { secure, maxAge: 0 }) },
      )
    }

    // ── OAuth: Яндекс и VK ID ──
    const start = /^\/api\/auth\/(yandex|vk|telegram)\/start$/.exec(path)
    if (method === 'GET' && start) {
      const provider = start[1]
      const cfg = ready(provider)
      if (!cfg) return fail(res, 'Этот способ входа сейчас выключен')
      const ref = url.searchParams.get('ref')?.slice(0, 16) ?? null
      const returnTo = safeReturn(url.searchParams.get('return'))
      if (provider === 'telegram') {
        const back = new URL('/auth/telegram', config.publicUrl)
        if (ref) back.searchParams.set('ref', ref)
        back.searchParams.set('return', returnTo)
        return redirect(res, telegramAuthorizeUrl(cfg, config.publicUrl, back.toString()))
      }
      const { verifier, challenge } = pkce()
      const state = accounts.saveState(provider, verifier, ref, returnTo)
      return redirect(
        res,
        provider === 'yandex'
          ? yandexAuthorizeUrl(cfg, redirectUri('yandex'), state)
          : vkAuthorizeUrl(cfg, redirectUri('vk'), state, challenge),
      )
    }

    const callback = /^\/api\/auth\/(yandex|vk)\/callback$/.exec(path)
    if (method === 'GET' && callback) {
      const provider = callback[1]
      const cfg = ready(provider)
      if (!cfg) return fail(res, 'Этот способ входа сейчас выключен')
      if (url.searchParams.get('error')) return fail(res, 'Вход отменён')
      const saved = accounts.takeState(url.searchParams.get('state') ?? '')
      const code = url.searchParams.get('code')
      if (!saved || saved.provider !== provider || !code)
        return fail(res, 'Сессия входа устарела, попробуйте ещё раз')
      try {
        const profile =
          provider === 'yandex'
            ? await yandexProfile(cfg, code)
            : await vkProfile(cfg, {
                code,
                deviceId: url.searchParams.get('device_id') ?? '',
                state: saved.state,
                verifier: saved.verifier,
                redirectUri: redirectUri('vk'),
              })
        const found = accounts.userFromIdentity(provider, profile.id, profile, saved.ref)
        const { 'set-cookie': cookie } = login(res, found)
        return redirect(res, safeReturn(saved.return_to), { 'set-cookie': cookie })
      } catch (error) {
        log(`вход ${provider}: ${error.message}`)
        return fail(res, 'Не удалось войти. Попробуйте ещё раз.')
      }
    }

    // ── Telegram: данные со страницы oauth.telegram.org ──
    if (method === 'POST' && path === '/api/auth/telegram') {
      loginLimit(ipOf(req))
      const cfg = ready('telegram')
      if (!cfg) throw new HttpError(400, 'Вход через Telegram выключен')
      const body = await readJson(req)
      const profile = verifyTelegramLogin(cfg, body.data)
      if (!profile) throw new HttpError(401, 'Подпись Telegram не прошла проверку')
      const found = accounts.userFromIdentity('telegram', profile.id, profile, body.ref ?? null)
      const { 'set-cookie': cookie } = login(res, found)
      return send(res, 200, me(found), { 'set-cookie': cookie })
    }

    // ── Мини-приложения Telegram и MAX ──
    if (method === 'POST' && path === '/api/auth/webapp') {
      loginLimit(ipOf(req))
      const body = await readJson(req, 16 * 1024)
      const platform =
        body.platform === 'max' ? 'max' : body.platform === 'telegram' ? 'telegram' : ''
      const cfg = platform ? ready(platform) : undefined
      if (!cfg) throw new HttpError(400, 'Вход из мини-приложения выключен')
      const profile = verifyWebAppInitData(cfg.botToken, body.initData)
      if (!profile) throw new HttpError(401, 'Данные мини-приложения не прошли проверку')
      // Ссылка-приглашение в мини-приложении приходит как start_param=ref_КОД.
      const ref = profile.startParam?.startsWith('ref_') ? profile.startParam.slice(4) : body.ref
      const found = accounts.userFromIdentity(platform, profile.id, profile, ref ?? null)
      const { 'set-cookie': cookie } = login(res, found)
      return send(res, 200, me(found), { 'set-cookie': cookie })
    }

    // ── Баланс и тарифы ──
    if (method === 'GET' && path === '/api/wallet') {
      if (!user) throw new HttpError(401, 'Войдите в аккаунт')
      return send(res, 200, {
        history: accounts.history(user.id).map((r) => ({
          id: r.id,
          delta: r.delta,
          reason: r.reason,
          note: r.note ?? undefined,
          balanceAfter: r.balance_after,
          createdAt: r.created_at,
        })),
      })
    }

    if (method === 'GET' && path === '/api/tariffs') {
      return send(res, 200, {
        tariffs: accounts.tariffs().map((t) => ({
          id: t.id,
          title: t.title,
          tokens: t.tokens,
          price: t.price,
          badge: t.badge || undefined,
        })),
        payments: false,
      })
    }

    return undefined
  }
}
