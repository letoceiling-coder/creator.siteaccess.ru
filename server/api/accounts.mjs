/**
 * Аккаунты и токены: пользователи, входы через провайдеров, сессии, журнал баланса,
 * настройки (цены, бонусы, интеграции) и тарифы. Всё в той же базе SQLite.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const id = () => randomBytes(12).toString('hex')

/** Значения по умолчанию; администратор меняет их в админке. */
export const defaults = {
  prices: { photo: 10, video: 30, animate5: 8, animate10: 15 },
  bonuses: { signup: 30, daily: 10, referrer: 20, invitee: 10 },
  integrations: {
    yandex: { enabled: false, clientId: '', clientSecret: '' },
    vk: { enabled: false, clientId: '', clientSecret: '' },
    telegram: { enabled: false, botUsername: '', botToken: '' },
    max: { enabled: false, botToken: '', botUsername: '' },
  },
  /** Оплата тарифов. Чеки (54-ФЗ): taxation — код системы налогообложения ЮKassa (1–6), vat — код НДС (1 — без НДС). */
  payments: {
    yookassa: { enabled: false, shopId: '', secretKey: '' },
    tbank: { enabled: false, terminalKey: '', password: '' },
    receipts: { enabled: false, taxation: 2, vat: 1 },
  },
}

const seedTariffs = [
  ['start', 'Старт', 100, 199, '', 1],
  ['optimal', 'Оптимальный', 300, 490, 'Выгодно', 2],
  ['pro', 'Профи', 1000, 1490, '−25%', 3],
]

/** День по Москве: бесплатные токены начисляются раз в сутки. */
export const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function checkPassword(password, stored) {
  if (!stored?.startsWith('scrypt$')) return false
  const [, saltHex, hashHex] = stored.split('$')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  })
  return timingSafeEqual(actual, expected)
}

export function openAccounts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      avatar TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      free_date TEXT,
      ref_code TEXT UNIQUE NOT NULL,
      referred_by TEXT,
      ref_rewarded INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );
    CREATE TABLE IF NOT EXISTS identities (
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (provider, provider_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      ref TEXT,
      balance_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id, id);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tariffs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      price INTEGER NOT NULL,
      badge TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      verifier TEXT NOT NULL,
      ref TEXT,
      return_to TEXT,
      created_at INTEGER NOT NULL
    );
  `)
  // Задачи принадлежат пользователю и хранят свою стоимость (для возврата).
  for (const sql of [
    'ALTER TABLE jobs ADD COLUMN user_id TEXT',
    'ALTER TABLE jobs ADD COLUMN cost INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0',
  ]) {
    try {
      db.exec(sql)
    } catch {
      // столбец уже есть
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS jobs_user ON jobs (user_id, created_at)')

  if (db.prepare('SELECT COUNT(*) AS n FROM tariffs').get().n === 0) {
    const insert = db.prepare(
      'INSERT INTO tariffs (id, title, tokens, price, badge, sort) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const row of seedTariffs) insert.run(...row)
  }

  const st = {
    setting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByRef: db.prepare('SELECT * FROM users WHERE ref_code = ?'),
    insertUser: db.prepare(
      `INSERT INTO users (id, email, name, avatar, password_hash, role, ref_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    identity: db.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?'),
    insertIdentity: db.prepare(
      'INSERT INTO identities (provider, provider_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    ),
    identitiesOf: db.prepare('SELECT provider FROM identities WHERE user_id = ?'),
    touch: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    add: db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?'),
    take: db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'),
    balance: db.prepare('SELECT balance FROM users WHERE id = ?'),
    ledger: db.prepare(
      'INSERT INTO ledger (user_id, delta, reason, note, ref, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    history: db.prepare('SELECT * FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    freeDate: db.prepare(
      'UPDATE users SET free_date = ? WHERE id = ? AND (free_date IS NULL OR free_date <> ?)',
    ),
    session: db.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ),
    sessionGet: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    sessionDel: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    sessionsGc: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    stateIns: db.prepare(
      'INSERT INTO oauth_states (state, provider, verifier, ref, return_to, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    stateTake: db.prepare(
      'DELETE FROM oauth_states WHERE state = ? AND created_at > ? RETURNING *',
    ),
    statesGc: db.prepare('DELETE FROM oauth_states WHERE created_at < ?'),
    rewarded: db.prepare('UPDATE users SET ref_rewarded = 1 WHERE id = ? AND ref_rewarded = 0'),
    refund: db.prepare('UPDATE jobs SET refunded = 1 WHERE id = ? AND refunded = 0 AND cost > 0'),
    tariffs: db.prepare('SELECT * FROM tariffs ORDER BY sort, price'),
    activeTariffs: db.prepare('SELECT * FROM tariffs WHERE active = 1 ORDER BY sort, price'),
  }

  function getSetting(key) {
    const row = st.setting.get(key)
    const base = defaults[key]
    if (!row) return structuredClone(base)
    const value = JSON.parse(row.value)
    // Новые поля из defaults подмешиваются к сохранённым.
    if (base && typeof base === 'object') {
      const merged = { ...structuredClone(base), ...value }
      if (key === 'integrations' || key === 'payments')
        for (const p of Object.keys(base)) merged[p] = { ...base[p], ...(value[p] ?? {}) }
      return merged
    }
    return value
  }

  function setSetting(key, value) {
    st.putSetting.run(key, JSON.stringify(value))
  }

  /** Изменение баланса с записью в журнал. Списание не уводит баланс в минус. */
  function change(userId, delta, reason, note = null, ref = null) {
    if (delta < 0) {
      const res = st.take.run(-delta, userId, -delta)
      if (res.changes !== 1) return false
    } else if (delta > 0) {
      st.add.run(delta, userId)
    }
    const after = st.balance.get(userId)?.balance ?? 0
    st.ledger.run(userId, delta, reason, note, ref, after, Date.now())
    return true
  }

  function newRefCode() {
    for (;;) {
      const code = randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7)
      if (!st.userByRef.get(code)) return code
    }
  }

  /** Новый пользователь: бонус за регистрацию и, если пришёл по ссылке, бонус приглашённому. */
  function createUser({
    email = null,
    name,
    avatar = null,
    password = null,
    role = 'user',
    ref = null,
  }) {
    const userId = id()
    const referrer = ref ? st.userByRef.get(ref) : undefined
    st.insertUser.run(
      userId,
      email ? email.toLowerCase() : null,
      name.slice(0, 80),
      avatar,
      password ? hashPassword(password) : null,
      role,
      newRefCode(),
      referrer?.id ?? null,
      Date.now(),
    )
    const bonuses = getSetting('bonuses')
    if (bonuses.signup > 0) change(userId, bonuses.signup, 'signup', 'Бонус за регистрацию')
    if (referrer && bonuses.invitee > 0)
      change(userId, bonuses.invitee, 'invitee', 'Бонус по приглашению')
    return st.userById.get(userId)
  }

  /** Вход через провайдера: найти по идентификатору или создать нового пользователя. */
  function userFromIdentity(provider, providerId, profile, ref) {
    const link = st.identity.get(provider, String(providerId))
    if (link) return st.userById.get(link.user_id)
    let user = profile.email ? st.userByEmail.get(profile.email.toLowerCase()) : undefined
    // Почту от провайдера привязываем к существующему аккаунту только если она подтверждена им.
    if (!user || !profile.emailVerified) {
      user = createUser({
        email: user ? null : (profile.email ?? null),
        name: profile.name || 'Пользователь',
        avatar: profile.avatar ?? null,
        ref,
      })
    }
    st.insertIdentity.run(provider, String(providerId), user.id, Date.now())
    return user
  }

  /** Бесплатные токены раз в сутки — только при нулевом балансе. */
  function ensureDaily(user) {
    if (!user || user.balance > 0) return user
    const bonuses = getSetting('bonuses')
    const day = today()
    if (bonuses.daily > 0 && st.freeDate.run(day, user.id, day).changes === 1) {
      change(user.id, bonuses.daily, 'daily', 'Бесплатные токены на сегодня')
    }
    return st.userById.get(user.id)
  }

  function createSession(userId, days = 30) {
    const token = randomBytes(32).toString('base64url')
    const now = Date.now()
    st.session.run(sha256(token), userId, now, now + days * 86_400_000)
    st.touch.run(now, userId)
    return token
  }

  function userBySession(token) {
    if (!token) return undefined
    const session = st.sessionGet.get(sha256(token), Date.now())
    if (!session) return undefined
    const user = st.userById.get(session.user_id)
    return user && !user.blocked ? user : undefined
  }

  function endSession(token) {
    if (token) st.sessionDel.run(sha256(token))
  }

  function saveState(provider, verifier, ref, returnTo) {
    const state = randomBytes(18).toString('base64url')
    st.statesGc.run(Date.now() - 15 * 60_000)
    st.stateIns.run(state, provider, verifier, ref ?? null, returnTo ?? null, Date.now())
    return state
  }

  function takeState(state) {
    return st.stateTake.get(state, Date.now() - 15 * 60_000)
  }

  /** Стоимость задачи в токенах по текущим ценам. */
  function costFor(kind, options) {
    const prices = getSetting('prices')
    if (kind === 'video') return prices.video
    if (kind === 'animate') return options.duration === 10 ? prices.animate10 : prices.animate5
    return prices.photo
  }

  /** Возврат токенов за неудавшуюся или отменённую задачу — один раз. */
  function refundJob(job) {
    if (!job?.user_id || !job.cost) return
    if (st.refund.run(job.id).changes === 1)
      change(job.user_id, job.cost, 'refund', 'Возврат за задачу', job.id)
  }

  /** Награда пригласившему — после первой успешной задачи приглашённого (защита от накрутки). */
  function rewardReferrer(userId) {
    const user = st.userById.get(userId)
    if (!user?.referred_by || user.ref_rewarded) return
    const bonuses = getSetting('bonuses')
    if (st.rewarded.run(userId).changes === 1 && bonuses.referrer > 0)
      change(
        user.referred_by,
        bonuses.referrer,
        'referral',
        `Друг ${user.name} создал первую работу`,
      )
  }

  function publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? undefined,
      avatar: user.avatar ?? undefined,
      role: user.role,
      balance: user.balance,
      refCode: user.ref_code,
      providers: st.identitiesOf.all(user.id).map((r) => r.provider),
      hasPassword: Boolean(user.password_hash),
    }
  }

  return {
    st,
    getSetting,
    setSetting,
    change,
    createUser,
    userFromIdentity,
    ensureDaily,
    createSession,
    userBySession,
    endSession,
    saveState,
    takeState,
    costFor,
    refundJob,
    rewardReferrer,
    publicUser,
    history: (userId, limit = 50) => st.history.all(userId, limit),
    tariffs: (all = false) => (all ? st.tariffs.all() : st.activeTariffs.all()),
    gc: () => st.sessionsGc.run(Date.now()),
  }
}
