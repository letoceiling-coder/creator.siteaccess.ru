/** Склейка планов видео: переходы, музыка с затуханием, H.264 + AAC. Общая для API и фабрики. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const encode = [
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '19',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
]

export async function seconds(file) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return Number(stdout.trim())
}

/**
 * Клипы → один ролик с переходами `fade` секунд. Если трек есть, он подрезается под длину
 * ролика (или добивается тишиной) и плавно затухает в конце.
 */
export async function assembleShots(clips, music, final, fade = 0.5) {
  const lengths = await Promise.all(clips.map(seconds))
  const total = lengths.reduce((a, b) => a + b, 0) - fade * (clips.length - 1)
  const parts = []
  let chain = '[0:v]'
  let offset = 0
  for (let i = 1; i < clips.length; i++) {
    offset += lengths[i - 1] - fade
    const label = `[v${i}]`
    parts.push(
      `${chain}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${label}`,
    )
    chain = label
  }
  parts.push(`${chain}format=yuv420p[v]`)
  const inputs = clips.flatMap((c) => ['-i', c])
  const withMusic = Boolean(music && existsSync(music))
  const args = withMusic
    ? [
        ...inputs,
        '-i',
        music,
        '-filter_complex',
        [
          ...parts,
          `[${clips.length}:a]apad,atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 1.5).toFixed(3)}:d=1.5[a]`,
        ].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        ...encode,
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-t',
        total.toFixed(3),
        final,
      ]
    : [...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', ...encode, '-an', final]
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300_000 })
  return { total, withMusic }
}
