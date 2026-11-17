#!/usr/bin/env node
/**
 * Выкладка сборки на creator.siteaccess.ru.
 *
 *   npm run deploy               сборка + выкладка
 *   npm run deploy -- --skip-build   только выкладка готового dist/
 *
 * Нужен SSH-доступ по ключу. Значения можно переопределить переменными окружения:
 * DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER, DEPLOY_PATH, DEPLOY_URL.
 * Сертификат и конфиг nginx уже настроены на сервере, скрипт трогает только каталог сайта.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const host = process.env.DEPLOY_HOST ?? '31.192.111.33'
const port = process.env.DEPLOY_PORT ?? '2222'
const user = process.env.DEPLOY_USER ?? 'root'
const target = process.env.DEPLOY_PATH ?? '/var/www/creator.siteaccess.ru'
const url = process.env.DEPLOY_URL ?? 'https://creator.siteaccess.ru/'
const skipBuild = process.argv.includes('--skip-build')

const root = resolve(import.meta.dirname, '..')
const archive = 'deploy-dist.tgz'
const remote = `${user}@${host}`
const sshOptions = ['-p', port, '-o', 'BatchMode=yes']

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0) {
    console.error(`\nОшибка: ${command} ${args[0] ?? ''} завершился с кодом ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

if (!skipBuild) {
  console.log('→ Сборка')
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    shell: process.platform === 'win32',
  })
}

if (!existsSync(resolve(root, 'dist/index.html'))) {
  console.error('dist/index.html не найден. Сначала выполните npm run build.')
  process.exit(1)
}

console.log('→ Архив dist/')
// Относительный путь: tar на Windows принимает «C:» за имя удалённого хоста.
run('tar', ['-czf', archive, '-C', 'dist', '.'])

try {
  console.log(`→ Загрузка на ${remote}`)
  run('scp', ['-P', port, '-o', 'BatchMode=yes', archive, `${remote}:/tmp/${archive}`])

  console.log('→ Выкладка')
  // Новая версия раскладывается рядом, старые хэшированные файлы assets сохраняются
  // для открытых вкладок, затем каталоги меняются местами.
  const script = `set -e
new="${target}.new"; old="${target}.old"
rm -rf "$new" "$old"; mkdir -p "$new"
tar -xzf /tmp/${archive} -C "$new"
[ -d "${target}/assets" ] && cp -r --update=none "${target}/assets/." "$new/assets/" || true
[ -d "${target}" ] && mv "${target}" "$old"
mv "$new" "${target}"
rm -rf "$old" /tmp/${archive}
echo ok`
  run('ssh', [...sshOptions, remote, script])
} finally {
  rmSync(resolve(root, archive), { force: true })
}

console.log(`→ Проверка ${url}`)
const response = await fetch(url, { redirect: 'follow' })
if (!response.ok) {
  console.error(`Сайт ответил ${response.status}`)
  process.exit(1)
}
console.log(`Готово: ${url} (${response.status})`)
