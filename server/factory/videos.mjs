#!/usr/bin/env node
/**
 * Демо-ролики для 30 видеошаблонов: кадр (Qwen-Image) → видео 5 с (Wan 2.2) → музыка → mp4.
 *   node videos.mjs run [--limit N] [--only id]   сделать недостающие
 *   node videos.mjs mux                           заново подложить музыку
 *   node videos.mjs status
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { download, qwenImageWorkflow, runWorkflow, uploadImage, wanVideoWorkflow } from './comfy.mjs'

const templates = JSON.parse(readFileSync(new URL('./video-templates.json', import.meta.url), 'utf8'))
const root = process.env.MEDIA_DIR ?? '/var/www/creator-media'
const dir = `${root}/video`
const musicDir = `${root}/music`
const statePath = `${dir}/state.json`
mkdirSync(dir, { recursive: true })
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} }

const style =
  'photorealistic, cinematic still, natural skin texture, realistic hands, film color grading, high detail'
const negativeStill =
  'text, watermark, logo, deformed hands, extra fingers, distorted face, blurry, cartoon, 3d render'
const negativeVideo = 'blurry, distorted face, extra limbs, static, jitter, flicker, watermark, text, morphing'

/** [сцена для кадра, движение для видео] */
const scenes = {
  'coast-run': ['a young woman running on a wet sand beach at sunrise, cold sea, low clouds', 'she runs along the shore toward the camera, hair and jacket moving in the wind, waves rolling'],
  'neon-roof': ['a man standing at the railing of a rooftop at night above a neon skyline', 'camera slowly pushes in, he turns his head toward the camera, city lights twinkle'],
  'desert-dawn': ['a person in light clothes standing on a sand dune crest at dawn, long shadows', 'wind blows sand off the dune and moves the clothes, slow cinematic dolly'],
  'old-town': ['a woman walking along a narrow old European stone street with arches at golden hour', 'she walks slowly toward the camera, soft warm light flickers between the arches'],
  'alpine-lake': ['a person standing at the edge of a mirror-calm alpine lake with misty pines', 'mist drifts across the water, gentle ripples, the person looks at the mountains'],
  'night-train': ['a young man by a train window at night, city lights streaking past', 'lights streak past the window, his reflection moves slightly, he turns and smiles softly'],
  'editorial-walk': ['a fashion model on a clean grey backdrop in a tailored coat, studio light', 'the model walks confidently toward the camera, coat swings, fashion film'],
  'yellow-street': ['a woman in a yellow jacket crossing a grey city crosswalk', 'she crosses the street with energetic steps, yellow jacket stands out, camera tracks sideways'],
  'linen-light': ['a woman in a linen dress by a large window with sheer curtains', 'curtains move in the breeze, soft light shifts, she touches the fabric and looks outside'],
  'coat-season': ['a man in a long wool coat on an autumn park alley with falling leaves', 'leaves fall around him, he walks forward, collar moves in the wind'],
  'studio-flash': ['a model posing against a bold colored studio backdrop with hard flash light', 'she changes pose rhythmically, flash light pulses, dynamic fashion shoot'],
  'rail-fit': ['a person in dark clothes on an empty train station platform with perspective lines', 'a train passes behind in a blur, he walks forward along the platform'],
  'pro-intro': ['a confident businesswoman in a modern glass office, soft daylight', 'she smiles, gives a small nod to the camera and adjusts her jacket, slow push-in'],
  'expert-card': ['a male expert in a smart casual jacket in a bright minimalist office', 'he gestures while explaining, subtle camera drift, natural expression'],
  'product-hold': ['a smiling woman holding a small product box over a wooden table, bright room', 'she lifts the product toward the camera and smiles, camera slowly moves closer'],
  'coffee-brand': ['a barista-style entrepreneur behind a wooden coffee counter with steam rising', 'steam rises from the cup, she places it on the counter and smiles, warm light'],
  'studio-bts': ['a creator working in a photo studio with a softbox light and a tripod', 'he adjusts the light and looks into the camera, subtle handheld movement'],
  'launch-day': ['a man in a dark jacket on a stage with a glowing screen behind him', 'he steps forward into the light, light beams sweep, confident presenter energy'],
  'study-evening': ['a woman reading in a cozy study with tall bookshelves and a green desk lamp', 'she turns a page and looks up at the window, lamp light flickers softly'],
  'rain-window': ['a woman sitting by a cafe window with rain streaking down the glass, city lights outside', 'raindrops slide down the window, she looks out thoughtfully, warm interior glow'],
  'hero-intro': ['a man in a dark long coat in a dim corridor with a bright door at the end', 'he walks toward the light, silhouette gains detail, cinematic hero reveal'],
  'letter-memory': ['a woman holding an old photograph and an envelope near a window, grainy film look', 'dust floats in the light, she lifts the photograph and smiles gently'],
  'space-walk': ['an astronaut-like person in a light suit floating in front of a planet and stars, cinematic sci-fi', 'she floats slowly in weightlessness, stars drift, the planet glows behind'],
  'spy-night': ['a man in a trench coat in a dark rainy alley with neon signs and steam', 'steam rises, he walks quickly through the alley, neon reflects on wet ground'],
  'birthday-glow': ['a young woman with a birthday cake with candles in a festive room with balloons', 'she blows out the candles, confetti falls, balloons sway'],
  'new-year': ['a couple by a decorated Christmas tree with garlands and warm lights', 'lights twinkle, they raise glasses and smile, snow falls outside the window'],
  'wedding-toast': ['a smiling man in a suit raising a champagne glass in a elegant hall with warm lights', 'he lifts the glass for a toast, lights sparkle, camera pushes in'],
  'summer-party': ['friends dancing on a terrace at sunset with string lights', 'they dance and laugh, string lights glow, warm sunset light moves'],
  graduation: ['a smiling graduate in a gown and cap in a sunny university courtyard', 'she throws the cap into the air and laughs, gown flutters'],
  'family-day': ['a family walking in a sunny park, parents with a child', 'they walk toward the camera laughing, the child runs ahead, warm sunlight'],
}

const size = {
  '9:16': { still: [928, 1664], video: [480, 832] },
  '16:9': { still: [1664, 928], video: [832, 480] },
  '1:1': { still: [1328, 1328], video: [640, 640] },
}

function save() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 1))
  renameSync(`${statePath}.tmp`, statePath)
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(state.done))
}

function mux(id) {
  const raw = `${dir}/${id}.silent.mp4`
  const out = `${dir}/${id}.mp4`
  const music = `${musicDir}/${id}.mp3`
  if (existsSync(music)) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', raw, '-i', music,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-af', 'afade=t=out:st=4:d=1', '-shortest', '-movflags', '+faststart', out,
    ])
    return true
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out])
  return false
}

async function make(t, index) {
  const [scene, motion] = scenes[t.id] ?? [t.blurb, t.shots[1]]
  const sz = size[t.ratio]
  // 1. Кадр
  const stills = await runWorkflow(
    qwenImageWorkflow({
      prompt: `${scene}. ${style}`,
      negative: negativeStill,
      width: sz.still[0],
      height: sz.still[1],
      seed: 9000 + index * 13,
      prefix: `creator/vstill-${t.id}`,
    }),
  )
  const png = await download(stills[0])
  const name = await uploadImage(png, `creator-${t.id}.png`)
  // 2. Видео
  const clips = await runWorkflow(
    wanVideoWorkflow({
      image: name,
      prompt: `${motion}, cinematic, natural motion, smooth camera`,
      negative: negativeVideo,
      width: sz.video[0],
      height: sz.video[1],
      seed: 3000 + index * 7,
      prefix: `creator/vclip-${t.id}`,
    }),
    { timeoutMs: 1_800_000 },
  )
  writeFileSync(`${dir}/${t.id}.silent.mp4`, await download(clips[0]))
  writeFileSync(`${dir}/${t.id}.png`, png)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/${t.id}.png`, '-vf', 'scale=720:-2', '-quality', '82', `${dir}/${t.id}-poster.webp`])
  rmSync(`${dir}/${t.id}.png`)
  const withMusic = mux(t.id)
  state.done[t.id] = { src: `/media/video/${t.id}.mp4`, poster: `/media/video/${t.id}-poster.webp`, ratio: t.ratio, seconds: 5, withMusic }
  save()
}

const [cmd = 'status', ...rest] = process.argv.slice(2)
const arg = (flag) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : undefined)
const limit = arg('--limit') ? Number(arg('--limit')) : Infinity
const only = arg('--only')

if (cmd === 'status') {
  const done = Object.values(state.done)
  console.log(`${done.length} из ${templates.length} роликов готово, с музыкой: ${done.filter((d) => d.withMusic).length}`)
} else if (cmd === 'mux') {
  for (const id of Object.keys(state.done)) {
    state.done[id].withMusic = mux(id)
    console.log(id, state.done[id].withMusic ? 'с музыкой' : 'без музыки')
  }
  save()
} else if (cmd === 'run') {
  const todo = templates
    .map((t, i) => [t, i])
    .filter(([t]) => (only ? t.id === only : !state.done[t.id]))
    .slice(0, limit)
  console.log(`К работе: ${todo.length} роликов`)
  let failed = 0
  for (const [n, [t, i]] of todo.entries()) {
    const started = Date.now()
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await make(t, i)
        console.log(`[${n + 1}/${todo.length}] ${t.id} за ${((Date.now() - started) / 1000).toFixed(0)} с`)
        break
      } catch (error) {
        console.error(`${t.id}, попытка ${attempt}: ${error.message}`)
        if (attempt === 3) failed += 1
        else await new Promise((r) => setTimeout(r, 30_000))
      }
    }
  }
  console.log(`Готово. Не удалось: ${failed}`)
} else {
  console.error('Команды: run [--limit N] [--only id], mux, status')
  process.exit(1)
}
