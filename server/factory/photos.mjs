#!/usr/bin/env node
/**
 * Фабрика фото: очередь на 150 кадров через ComfyUI. Можно останавливать и запускать заново:
 * готовые кадры пропускаются.
 *   node photos.mjs run [--limit N]   сделать недостающие кадры
 *   node photos.mjs status            сколько готово
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { download, qwenImageWorkflow, runWorkflow } from './comfy.mjs'
import { buildJobs, locations, negative, shots } from './locations.mjs'

const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/photos`
const statePath = `${dir}/state.json`
mkdirSync(dir, { recursive: true })

const jobs = buildJobs()
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
}

function writeManifest() {
  const manifest = {
    aiGenerated: true,
    updated: new Date().toISOString(),
    locations: locations
      .map((loc) => ({
        id: loc.id,
        title: loc.title,
        shots: shots
          .map((s) => {
            const item = state.done[`${loc.id}-${s.kind}`]
            return item ? { kind: s.kind, label: s.ru, ...item } : null
          })
          .filter(Boolean),
      }))
      .filter((l) => l.shots.length),
  }
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest))
}

function toWebp(png, out, width, quality) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', `scale=${width}:-2`, '-quality', String(quality), out])
}

async function make(job) {
  const files = await runWorkflow(
    qwenImageWorkflow({
      prompt: job.prompt,
      negative,
      width: 1104,
      height: 1472,
      seed: job.seed,
      prefix: `creator/${job.id}`,
    }),
  )
  const tmp = `${dir}/${job.id}.png`
  writeFileSync(tmp, await download(files[0]))
  toWebp(tmp, `${dir}/${job.id}.webp`, 1104, 84)
  toWebp(tmp, `${dir}/${job.id}-thumb.webp`, 420, 78)
  rmSync(tmp)
  state.done[job.id] = {
    src: `/media/photos/${job.id}.webp`,
    thumb: `/media/photos/${job.id}-thumb.webp`,
    w: 1104,
    h: 1472,
    seed: job.seed,
  }
  save()
  writeManifest()
}

const [cmd = 'status', ...rest] = process.argv.slice(2)
const limit = rest.includes('--limit') ? Number(rest[rest.indexOf('--limit') + 1]) : Infinity

if (cmd === 'status') {
  console.log(`${Object.keys(state.done).length} из ${jobs.length} кадров готово`)
} else if (cmd === 'run') {
  const todo = jobs.filter((j) => !state.done[j.id]).slice(0, limit)
  console.log(`К работе: ${todo.length} кадров`)
  let failed = 0
  for (const [i, job] of todo.entries()) {
    const t = Date.now()
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await make(job)
        console.log(`[${i + 1}/${todo.length}] ${job.id} за ${((Date.now() - t) / 1000).toFixed(0)} с`)
        break
      } catch (error) {
        console.error(`${job.id}, попытка ${attempt}: ${error.message}`)
        if (attempt === 3) failed += 1
        else await new Promise((r) => setTimeout(r, 20_000))
      }
    }
  }
  console.log(`Готово. Не удалось: ${failed}. Всего готово ${Object.keys(state.done).length}/${jobs.length}`)
} else {
  console.error('Команды: run [--limit N], status')
  process.exit(1)
}
