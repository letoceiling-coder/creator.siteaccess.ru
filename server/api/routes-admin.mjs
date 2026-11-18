/** Админка: пользователи и балансы, тарифы, цены и бонусы, интеграции, задачи. */
import { HttpError, readJson, send } from './http.mjs'

const SECRET_KEYS = ['clientSecret', 'botToken', 'secretKey', 'password']
const HIDDEN_KEYS = ['webhookFor']
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '')

const int = (v, min, max, name) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max)
    throw new HttpError(400, `Неверное значение: ${name}`)
  return n
}

export function adminRoutes({ accounts, db, q, log, payments, bots, channels }) {
  const st = {
    stats: db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE created_at > ?) AS usersToday,
      (SELECT COUNT(*) FROM jobs WHERE created_at > ?) AS jobsToday,
      (SELECT COUNT(*) FROM jobs WHERE status = 'queued') AS queued,
      (SELECT COUNT(*) FROM jobs WHERE status = 'running') AS running,
      (SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND created_at > ?) AS failedToday,
      (SELECT COALESCE(SUM(-delta), 0) FROM ledger WHERE delta < 0 AND reason = 'job' AND created_at > ?) AS spentToday`),
    users: db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id) AS jobs
      FROM users u WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ? OR u.id = ?)
      ORDER BY u.created_at DESC LIMIT 100`),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setBlocked: db.prepare('UPDATE users SET blocked = ? WHERE id = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    jobs: db.prepare(`SELECT j.id, j.kind, j.target, j.status, j.cost, j.refunded, j.created_at, j.finished_at,
      j.error, u.name AS user_name, u.email AS user_email
      FROM jobs j LEFT JOIN users u ON u.id = j.user_id ORDER BY j.created_at DESC LIMIT 100`),
    tariffIns: db.prepare(
      'INSERT INTO tariffs (id, title, tokens, price, badge, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    tariffUpd: db.prepare(
      'UPDATE tariffs SET title = ?, tokens = ?, price = ?, badge = ?, active = ?, sort = ? WHERE id = ?',
    ),
    tariffDel: db.prepare('DELETE FROM tariffs WHERE id = ?'),
  }

  function userView(u) {
    return {
      id: u.id,
      name: u.name,
      email: u.email ?? undefined,
      role: u.role,
      balance: u.balance,
      blocked: Boolean(u.blocked),
      jobs: u.jobs ?? 0,
      providers: accounts.st.identitiesOf.all(u.id).map((r) => r.provider),
      createdAt: u.created_at,
      lastLogin: u.last_login ?? undefined,
    }
  }

  function integrationsView(key = 'integrations') {
    const all = accounts.getSetting(key)
    const out = {}
    for (const [p, cfg] of Object.entries(all)) {
      out[p] = {}
      for (const [k, v] of Object.entries(cfg)) {
        if (HIDDEN_KEYS.includes(k)) continue
        out[p][k] = SECRET_KEYS.includes(k) ? { set: Boolean(v), hint: mask(v) } : v
      }
    }
    return out
  }

  function tariffBody(body) {
    const title = String(body.title ?? '').trim()
    if (!title || title.length > 60) throw new HttpError(400, 'Название тарифа: 1–60 символов')
    return [
      title,
      int(body.tokens, 1, 1_000_000, 'токены'),
      int(body.price, 0, 10_000_000, 'цена'),
      String(body.badge ?? '').slice(0, 30),
      body.active === false ? 0 : 1,
      int(body.sort ?? 0, 0, 1000, 'порядок'),
    ]
  }

  return async function handleAdmin(req, res, path, user) {
    if (!path.startsWith('/api/admin/')) return undefined
    if (!user) throw new HttpError(401, 'Войдите в аккаунт')
    if (user.role !== 'admin') throw new HttpError(403, 'Нужны права администратора')
    if (channels?.owns(path)) return channels.handle(req, res, path, user)
    const method = req.method
    const day = Date.now() - 86_400_000

    if (method === 'GET' && path === '/api/admin/stats') {
      return send(res, 200, st.stats.get(day, day, day, day))
    }

    if (method === 'GET' && path === '/api/admin/users') {
      const query = new URL(req.url, 'http://x').searchParams.get('q')?.trim() ?? ''
      const like = `%${query}%`
      return send(res, 200, { users: st.users.all(query, like, like, query).map(userView) })
    }

    const userMatch = /^\/api\/admin\/users\/([0-9a-f]{24})(\/tokens)?$/.exec(path)
    if (userMatch) {
      const target = st.user.get(userMatch[1])
      if (!target) throw new HttpError(404, 'Пользователь не найден')
      const body = ['POST', 'PATCH'].includes(method) ? await readJson(req) : {}
      if (userMatch[2] && method === 'POST') {
        const delta = int(body.delta, -1_000_000, 1_000_000, 'количество')
        if (delta === 0) throw new HttpError(400, 'Укажите количество токенов')
        const note = String(body.note ?? '').slice(0, 200) || 'Изменено администратором'
        if (!accounts.change(target.id, delta, 'admin', note))
          throw new HttpError(400, 'Нельзя списать больше, чем на балансе')
        log(`админ ${user.id.slice(0, 8)}: ${delta} токенов пользователю ${target.id.slice(0, 8)}`)
        return send(res, 200, { user: userView(st.user.get(target.id)) })
      }
      if (!userMatch[2] && method === 'PATCH') {
        if (body.role !== undefined) {
          if (!['user', 'admin'].includes(body.role)) throw new HttpError(400, 'Неверная роль')
          if (target.id === user.id && body.role !== 'admin')
            throw new HttpError(400, 'Нельзя снять права администратора с самого себя')
          st.setRole.run(body.role, target.id)
        }
        if (body.blocked !== undefined) {
          if (target.id === user.id) throw new HttpError(400, 'Нельзя заблокировать самого себя')
          st.setBlocked.run(body.blocked ? 1 : 0, target.id)
          if (body.blocked) st.dropSessions.run(target.id)
        }
        return send(res, 200, { user: userView(st.user.get(target.id)) })
      }
    }

    if (path === '/api/admin/settings') {
      if (method === 'GET')
        return send(res, 200, {
          prices: accounts.getSetting('prices'),
          bonuses: accounts.getSetting('bonuses'),
        })
      if (method === 'PUT') {
        const body = await readJson(req)
        const p = body.prices ?? {}
        const b = body.bonuses ?? {}
        accounts.setSetting('prices', {
          photo: int(p.photo, 0, 100_000, 'цена фото'),
          video: int(p.video, 0, 100_000, 'цена видео'),
          animate5: int(p.animate5, 0, 100_000, 'цена оживления 5 с'),
          animate10: int(p.animate10, 0, 100_000, 'цена оживления 10 с'),
        })
        accounts.setSetting('bonuses', {
          signup: int(b.signup, 0, 100_000, 'бонус за регистрацию'),
          daily: int(b.daily, 0, 100_000, 'бесплатно в сутки'),
          referrer: int(b.referrer, 0, 100_000, 'награда за друга'),
          invitee: int(b.invitee, 0, 100_000, 'бонус приглашённому'),
        })
        log(`админ ${user.id.slice(0, 8)}: изменены цены и бонусы`)
        return send(res, 200, {
          prices: accounts.getSetting('prices'),
          bonuses: accounts.getSetting('bonuses'),
        })
      }
    }

    if (path === '/api/admin/integrations') {
      if (method === 'GET') return send(res, 200, { integrations: integrationsView() })
      if (method === 'PUT') {
        const body = await readJson(req)
        const current = accounts.getSetting('integrations')
        for (const [p, cfg] of Object.entries(current)) {
          const next = body[p]
          if (!next || typeof next !== 'object') continue
          for (const key of Object.keys(cfg)) {
            if (!(key in next)) continue
            const value = next[key]
            if (key === 'enabled') cfg.enabled = Boolean(value)
            else if (SECRET_KEYS.includes(key)) {
              // Пустое поле — оставить прежний секрет; null — удалить.
              if (value === null) cfg[key] = ''
              else if (typeof value === 'string' && value.trim())
                cfg[key] = value.trim().slice(0, 300)
            } else
              cfg[key] = String(value ?? '')
                .trim()
                .slice(0, 300)
          }
        }
        accounts.setSetting('integrations', current)
        log(`админ ${user.id.slice(0, 8)}: изменены интеграции`)
        return send(res, 200, { integrations: integrationsView() })
      }
    }

    if (path === '/api/admin/tariffs') {
      if (method === 'GET') return send(res, 200, { tariffs: accounts.tariffs(true) })
      if (method === 'POST') {
        const body = await readJson(req)
        const id = String(body.id ?? '').trim()
        if (!/^[a-z0-9-]{2,30}$/.test(id))
          throw new HttpError(400, 'Код тарифа: латиница, цифры и дефис, 2–30 символов')
        try {
          st.tariffIns.run(id, ...tariffBody(body))
        } catch {
          throw new HttpError(409, 'Тариф с таким кодом уже есть')
        }
        return send(res, 201, { tariffs: accounts.tariffs(true) })
      }
    }
    const tariffMatch = /^\/api\/admin\/tariffs\/([a-z0-9-]{2,30})$/.exec(path)
    if (tariffMatch) {
      if (method === 'PUT') {
        const body = await readJson(req)
        st.tariffUpd.run(...tariffBody(body), tariffMatch[1])
        return send(res, 200, { tariffs: accounts.tariffs(true) })
      }
      if (method === 'DELETE') {
        st.tariffDel.run(tariffMatch[1])
        return send(res, 200, { tariffs: accounts.tariffs(true) })
      }
    }

    if (path === '/api/admin/payments') {
      if (method === 'GET') return send(res, 200, { payments: integrationsView('payments') })
      if (method === 'PUT') {
        const body = await readJson(req)
        const current = accounts.getSetting('payments')
        for (const p of ['yookassa', 'tbank']) {
          const next = body[p]
          if (!next || typeof next !== 'object') continue
          for (const key of Object.keys(current[p])) {
            if (!(key in next)) continue
            const value = next[key]
            if (key === 'enabled') current[p].enabled = Boolean(value)
            else if (SECRET_KEYS.includes(key)) {
              if (value === null) current[p][key] = ''
              else if (typeof value === 'string' && value.trim())
                current[p][key] = value.trim().slice(0, 300)
            } else
              current[p][key] = String(value ?? '')
                .trim()
                .slice(0, 100)
          }
        }
        if (body.receipts && typeof body.receipts === 'object') {
          const r = body.receipts
          current.receipts = {
            enabled: Boolean(r.enabled ?? current.receipts.enabled),
            taxation: int(r.taxation ?? current.receipts.taxation, 1, 6, 'система налогообложения'),
            vat: int(r.vat ?? current.receipts.vat, 1, 12, 'ставка НДС'),
          }
        }
        accounts.setSetting('payments', current)
        log(`админ ${user.id.slice(0, 8)}: изменены настройки оплаты`)
        return send(res, 200, { payments: integrationsView('payments') })
      }
    }

    if (method === 'GET' && path === '/api/admin/bots/status') {
      const safe = async (fn) => {
        try {
          return await fn()
        } catch (error) {
          return { error: error.message }
        }
      }
      const cfg = accounts.getSetting('integrations')
      return send(res, 200, {
        telegram: cfg.telegram.botToken
          ? await safe(bots.admin.telegramStatus)
          : { error: 'Не задан токен' },
        max: cfg.max.botToken ? await safe(bots.admin.maxStatus) : { error: 'Не задан токен' },
      })
    }

    const setup = /^\/api\/admin\/bots\/(telegram|max)\/setup$/.exec(path)
    if (method === 'POST' && setup) {
      try {
        const status =
          setup[1] === 'telegram' ? await bots.admin.telegramSetup() : await bots.admin.maxSetup()
        log(`админ ${user.id.slice(0, 8)}: настроен бот ${setup[1]}`)
        return send(res, 200, { status })
      } catch (error) {
        throw new HttpError(502, error.message)
      }
    }

    if (method === 'GET' && path === '/api/admin/orders') {
      return send(res, 200, { orders: payments.recent() })
    }

    if (method === 'GET' && path === '/api/admin/jobs') {
      return send(res, 200, {
        jobs: st.jobs.all().map((j) => ({
          id: j.id,
          kind: j.kind,
          target: j.target,
          status: j.status,
          cost: j.cost,
          refunded: Boolean(j.refunded),
          error: j.error ?? undefined,
          user: j.user_name ? `${j.user_name}${j.user_email ? ` · ${j.user_email}` : ''}` : '—',
          createdAt: j.created_at,
          finishedAt: j.finished_at ?? undefined,
        })),
        queued: q.queued.get().n,
      })
    }

    throw new HttpError(404, 'Не найдено')
  }
}
