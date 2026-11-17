/** Проверка и нормализация загруженных фото. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024

/** Тип по сигнатуре файла, а не по расширению или заявленному MIME. */
export function sniff(buf) {
  if (buf.length < 12) return undefined
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png'
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp'
  return undefined
}

/**
 * Перекодирование в PNG через ffmpeg: снимает EXIF и геометки, ограничивает размер 2048 px,
 * заодно отсеивает битые файлы. Возвращает размеры результата.
 */
export async function normalize(input, output) {
  await run(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      input,
      '-vf',
      "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease",
      '-map_metadata',
      '-1',
      '-frames:v',
      '1',
      output,
    ],
    { timeout: 60_000 },
  )
  const { stdout } = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      output,
    ],
    { timeout: 30_000 },
  )
  const [width, height] = stdout.trim().split(',').map(Number)
  return { width, height }
}

export async function toJpeg(input, output) {
  await run(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', input, '-q:v', '2', '-map_metadata', '-1', output],
    {
      timeout: 60_000,
    },
  )
}

export async function toWebp(input, output, width) {
  await run(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', input, '-vf', `scale=${width}:-2`, '-quality', '82', output],
    { timeout: 60_000 },
  )
}
