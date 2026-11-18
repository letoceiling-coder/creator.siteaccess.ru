#!/usr/bin/env node
/**
 * Служебные команды на сервере.
 *
 *   CS_PASSWORD='…' node cli.mjs create-user --email a@b.ru --name "Имя" [--role admin]
 *   node cli.mjs set-role --email a@b.ru --role admin
 *
 * Пароль передаётся только через переменную окружения CS_PASSWORD — не в аргументах,
 * чтобы не попадать в историю команд и список процессов.
 */
import { join } from 'node:path'
import { hashPassword, openAccounts } from './accounts.mjs'
import { openDb } from './db.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const arg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i > 0 ? args[i + 1] : undefined
}

const dataDir = process.env.DATA_DIR ?? '/var/lib/creator-studio'
const { db } = openDb(join(dataDir, 'jobs.sqlite'))
const accounts = openAccounts(db)

const email = arg('email')?.trim().toLowerCase()
if (!email) {
  console.error('Нужен --email')
  process.exit(1)
}

if (cmd === 'create-user') {
  const password = process.env.CS_PASSWORD ?? ''
  const name = arg('name') ?? email
  const role = arg('role') === 'admin' ? 'admin' : 'user'
  if (password.length < 8) {
    console.error('Пароль (CS_PASSWORD) — не короче 8 символов')
    process.exit(1)
  }
  const existing = accounts.st.userByEmail.get(email)
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, name = ? WHERE id = ?').run(
      hashPassword(password),
      role,
      name,
      existing.id,
    )
    console.log(`Обновлён пользователь ${existing.id} (${role})`)
  } else {
    const user = accounts.createUser({ email, name, password, role })
    console.log(`Создан пользователь ${user.id} (${role}), баланс ${user.balance}`)
  }
} else if (cmd === 'set-role') {
  const role = arg('role') === 'admin' ? 'admin' : 'user'
  const res = db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, email)
  console.log(res.changes ? `Роль: ${role}` : 'Пользователь не найден')
} else {
  console.error('Команды: create-user, set-role')
  process.exit(1)
}
