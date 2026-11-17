/**
 * Контроль качества: лицо видно целиком. Детектор YuNet работает в Python контейнера ComfyUI
 * (там есть OpenCV), файлы передаются через смонтированный каталог вывода ComfyUI.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

const hostDir = process.env.QC_DIR ?? '/srv/comfyui/data/ComfyUI/output/creator-qc'
const containerDir = process.env.QC_CONTAINER_DIR ?? '/data/ComfyUI/output/creator-qc'
const container = process.env.COMFY_CONTAINER ?? 'comfyui'

/** Доля кадров ролика, где лицо должно быть видно целиком (для пары — оба лица). */
export const MIN_FACE_RATIO = 0.8
export const MIN_PAIR_RATIO = 0.6

function prepare() {
  mkdirSync(hostDir, { recursive: true })
  copyFileSync(new URL('./faces.py', import.meta.url), join(hostDir, 'faces.py'))
}

/** Проверка набора файлов. Возвращает результат по каждому файлу в порядке имён. */
async function checkDir(fill, minFaces = 1) {
  prepare()
  const name = randomBytes(6).toString('hex')
  const dir = join(hostDir, name)
  mkdirSync(dir, { recursive: true })
  try {
    await fill(dir)
    const { stdout } = await run(
      'docker',
      [
        'exec',
        container,
        '/data/venv/bin/python',
        `${containerDir}/faces.py`,
        `${containerDir}/${name}`,
        String(minFaces),
      ],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    )
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '[]')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Лицо на изображении видно целиком? */
export async function imageHasFace(buffer, minFaces = 1) {
  const [result] = await checkDir(
    async (dir) => writeFileSync(join(dir, 'image.png'), buffer),
    minFaces,
  )
  return result ?? { ok: false, reason: 'no_result' }
}

export async function filesHaveFaces(paths) {
  return checkDir(async (dir) => {
    for (const [i, p] of paths.entries())
      copyFileSync(p, join(dir, `${String(i).padStart(3, '0')}-${basename(p)}`))
  })
}

/** Доля кадров ролика (2 кадра в секунду), где лицо видно целиком. */
export async function videoFaceRatio(video, minFaces = 1) {
  const results = await checkDir(async (dir) => {
    await run(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        video,
        '-vf',
        'fps=2,scale=640:-2',
        join(dir, 'f%03d.jpg'),
      ],
      { timeout: 120_000 },
    )
  }, minFaces)
  if (!results.length) return { ratio: 0, frames: 0, bad: [] }
  const good = results.filter((r) => r.ok).length
  return {
    ratio: good / results.length,
    frames: results.length,
    bad: results.filter((r) => !r.ok).map((r) => `${r.file}:${r.reason}`),
  }
}

export function qcFiles() {
  try {
    return readdirSync(hostDir)
  } catch {
    return []
  }
}
