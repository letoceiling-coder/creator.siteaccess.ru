#!/usr/bin/env node
/**
 * Музыка для 30 видеошаблонов: ACE-Step через ComfyUI. Описание берётся из каталога шаблонов.
 *   node music.mjs run [--limit N] | status
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { aceMusicWorkflow, download, runWorkflow } from './comfy.mjs'

const templates = JSON.parse(
  readFileSync(new URL('./video-templates.json', import.meta.url), 'utf8'),
)
const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/music`
const statePath = `${dir}/state.json`
mkdirSync(dir, { recursive: true })
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

const bright = new Set(['party', 'style', 'brand'])
const keys = {
  bright: ['C major', 'G major', 'D major', 'F major'],
  dark: ['A minor', 'D minor', 'E minor', 'C minor'],
}

function describe(t) {
  return `${t.genre}, instrumental, ${t.mood}, modern production, clean mix, cinematic, background music for a short social video, no vocals`
}

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
  const manifest = Object.fromEntries(Object.entries(state.done).map(([id, v]) => [id, v.src]))
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest))
}

async function make(t, index) {
  const pool = bright.has(t.category) ? keys.bright : keys.dark
  const seconds = t.seconds + 3 // запас под окончание
  const files = await runWorkflow(
    aceMusicWorkflow({
      tags: describe(t),
      bpm: t.bpm,
      seconds,
      keyscale: pool[index % pool.length],
      seed: 5000 + index * 31,
      prefix: `creator/music-${t.id}`,
    }),
    { timeoutMs: 1_200_000 },
  )
  const tmp = `${dir}/${t.id}.src`
  writeFileSync(tmp, await download(files[0]))
  // Нормализация громкости и мягкое затухание в конце.
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'mp3',
    '-i',
    tmp,
    '-af',
    `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=${seconds - 1.5}:d=1.5`,
    '-b:a',
    '160k',
    `${dir}/${t.id}.mp3`,
  ])
  rmSync(tmp)
  state.done[t.id] = { src: `/media/music/${t.id}.mp3`, bpm: t.bpm, seconds }
  save()
}

const [cmd = 'status', ...rest] = process.argv.slice(2)
const limit = rest.includes('--limit') ? Number(rest[rest.indexOf('--limit') + 1]) : Infinity
if (cmd === 'status') {
  console.log(`${Object.keys(state.done).length} из ${templates.length} треков готово`)
} else if (cmd === 'run') {
  const todo = templates
    .map((t, i) => [t, i])
    .filter(([t]) => !state.done[t.id])
    .slice(0, limit)
  console.log(`К работе: ${todo.length} треков`)
  let failed = 0
  for (const [n, [t, i]] of todo.entries()) {
    const started = Date.now()
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await make(t, i)
        console.log(
          `[${n + 1}/${todo.length}] ${t.id} за ${((Date.now() - started) / 1000).toFixed(0)} с`,
        )
        break
      } catch (error) {
        console.error(`${t.id}, попытка ${attempt}: ${error.message}`)
        if (attempt === 3) failed += 1
        else await new Promise((r) => setTimeout(r, 20_000))
      }
    }
  }
  console.log(
    `Готово. Не удалось: ${failed}. Всего ${Object.keys(state.done).length}/${templates.length}`,
  )
} else {
  console.error('Команды: run [--limit N], status')
  process.exit(1)
}
