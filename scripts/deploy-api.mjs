#!/usr/bin/env node
/**
 * Выкладка API и фабрики (`server/`) на сервер: /opt/creator-studio, unit creator-studio-api.
 *
 *   npm run deploy:api
 *
 * Переменные: DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER. Внешних зависимостей нет, npm install не нужен.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const host = process.env.DEPLOY_HOST ?? '31.192.111.33'
const port = process.env.DEPLOY_PORT ?? '2222'
const user = process.env.DEPLOY_USER ?? 'root'
const target = '/opt/creator-studio'
const remote = `${user}@${host}`
const root = resolve(import.meta.dirname, '..')
const archive = 'deploy-api.tgz'

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\nОшибка: ${command} завершился с кодом ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.log('→ Архив server/')
run('tar', ['-czf', archive, '--exclude=*.test.mjs', '-C', 'server', '.'])
try {
  console.log(`→ Загрузка на ${remote}`)
  run('scp', ['-P', port, '-o', 'BatchMode=yes', archive, `${remote}:/tmp/${archive}`])
  console.log('→ Установка и перезапуск')
  const script = `set -e
mkdir -p ${target} /var/lib/creator-studio /var/www/creator-media/jobs
rm -rf ${target}.new && mkdir -p ${target}.new
tar -xzf /tmp/${archive} -C ${target}.new
rm -rf ${target}.old
[ -d ${target} ] && mv ${target} ${target}.old
mv ${target}.new ${target}
cp ${target}/creator-studio-api.service /etc/systemd/system/creator-studio-api.service
systemctl daemon-reload
systemctl enable --quiet creator-studio-api
systemctl restart creator-studio-api
rm -rf ${target}.old /tmp/${archive}
for i in $(seq 1 20); do curl -fsS 127.0.0.1:3480/api/health && exit 0; sleep 0.5; done
journalctl -u creator-studio-api -n 30 --no-pager; exit 1`
  run('ssh', ['-p', port, '-o', 'BatchMode=yes', remote, script])
} finally {
  rmSync(resolve(root, archive), { force: true })
}
console.log('\nГотово: API запущен')
