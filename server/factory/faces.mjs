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

/**
 * Сходство лиц (SFace, косинус): у одного человека на разных снимках обычно 0.45–0.8,
 * у разных людей — ниже 0.3. Порог OpenCV для «тот же человек» — 0.363.
 */
export const SAME_PERSON = 0.363

/**
 * Проверка набора файлов. Возвращает результат по каждому файлу в порядке имён.
 * refs — фото пользователя: тогда в результате есть similarity (сходство с ним).
 */
async function checkDir(fill, minFaces = 1, refs = []) {
  prepare()
  const name = randomBytes(6).toString('hex')
  const dir = join(hostDir, name)
  const refDir = join(hostDir, `${name}-refs`)
  mkdirSync(dir, { recursive: true })
  if (refs.length) {
    mkdirSync(refDir, { recursive: true })
    for (const [i, buf] of refs.entries()) writeFileSync(join(refDir, `${i}.png`), buf)
  }
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
        ...(refs.length ? [`${containerDir}/${name}-refs`] : []),
      ],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    )
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '[]')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(refDir, { recursive: true, force: true })
  }
}

/** Крупный план лица с фото пользователя (квадрат 1024) — дополнительный референс. */
export async function faceCrop(buffer) {
  prepare()
  const name = `${randomBytes(6).toString('hex')}-src.png`
  const src = join(hostDir, name)
  writeFileSync(src, buffer)
  try {
    const { stdout } = await run(
      'docker',
      [
        'exec',
        container,
        '/data/venv/bin/python',
        `${containerDir}/faces.py`,
        '--crop',
        `${containerDir}/${name}`,
      ],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
    )
    const res = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}')
    return res.ok ? Buffer.from(res.png, 'base64') : undefined
  } finally {
    rmSync(src, { force: true })
  }
}

/** Лицо видно целиком и похоже на фото пользователя? */
export async function imageIdentity(buffer, refs, minFaces = 1) {
  const [result] = await checkDir(
    async (dir) => writeFileSync(join(dir, 'image.png'), buffer),
    minFaces,
    refs,
  )
  return result ?? { ok: false, reason: 'no_result', similarity: 0 }
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

/**
 * Доля кадров ролика (2 кадра в секунду), где лицо видно целиком; с refs — ещё и сходство
 * с фото пользователя: среднее и доля кадров, где это тот же человек.
 */
export async function videoFaceRatio(video, minFaces = 1, refs = []) {
  const results = await checkDir(
    async (dir) => {
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
    },
    minFaces,
    refs,
  )
  if (!results.length) return { ratio: 0, frames: 0, bad: [], similarity: 0, sameRatio: 0 }
  const good = results.filter((r) => r.ok).length
  const sims = results.map((r) => r.similarity ?? 0)
  return {
    ratio: good / results.length,
    similarity: sims.reduce((a, b) => a + b, 0) / sims.length,
    sameRatio: sims.filter((v) => v >= SAME_PERSON).length / sims.length,
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
