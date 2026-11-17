/**
 * Процедурный саундтрек для превью шаблонов: бочка, хэт, бас и арпеджио по темпу.
 * Это набросок настроения, а не финальная музыка (она будет из лицензионной библиотеки).
 */

export interface Soundtrack {
  start: () => Promise<void>
  stop: () => void
  setMuted: (muted: boolean) => void
}

const minor = [0, 3, 5, 7, 10]
const major = [0, 2, 4, 7, 9]
const bars = [0, -4, -2, -5]

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

export function createSoundtrack(seed: string, bpm: number, bright: boolean): Soundtrack | null {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null

  const h = hash(seed)
  const root = 40 + (h % 8)
  const scale = bright ? major : minor
  const dance = bpm >= 108
  const mid = bpm >= 80 && bpm < 108
  const stepSec = 60 / bpm / 4

  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noise: AudioBuffer | null = null
  let timer = 0
  let step = 0
  let next = 0
  let muted = false

  function env(g: GainNode, t: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  }

  function tone(
    type: OscillatorType,
    freq: number,
    t: number,
    peak: number,
    decay: number,
    cutoff = 3000,
  ) {
    if (!ctx || !master) return
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    env(g, t, peak, decay)
    osc.connect(filter).connect(g).connect(master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }

  function kick(t: number) {
    if (!ctx || !master) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    env(g, t, 0.9, 0.28)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + 0.32)
  }

  function hat(t: number, peak: number, decay: number) {
    if (!ctx || !master || !noise) return
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    src.buffer = noise
    filter.type = 'highpass'
    filter.frequency.value = 7000
    env(g, t, peak, decay)
    src.connect(filter).connect(g).connect(master)
    src.start(t)
    src.stop(t + decay + 0.02)
  }

  function note(degree: number, octave: number, barShift: number) {
    const idx = ((degree % scale.length) + scale.length) % scale.length
    return root + barShift + octave * 12 + (scale[idx] ?? 0)
  }

  function play(s: number, t: number) {
    const bar = Math.floor(s / 16) % bars.length
    const shift = bars[bar] ?? 0
    const i = s % 16

    if (dance) {
      if (i % 4 === 0) kick(t)
      if (i % 4 === 2) hat(t, 0.22, 0.05)
      if (i % 2 === 1) hat(t, 0.07, 0.025)
      if ([0, 3, 6, 10, 12].includes(i))
        tone('sawtooth', midi(note(0, 0, shift)), t, 0.32, 0.22, 420)
      if (i % 4 === 2) tone('triangle', midi(note(i + bar, 2, shift)), t, 0.14, 0.2, 2600)
    } else if (mid) {
      if (i === 0 || i === 10) kick(t)
      if (i === 8) hat(t, 0.2, 0.09)
      if (i % 2 === 0) hat(t, 0.05, 0.03)
      if (i === 0 || i === 8) tone('triangle', midi(note(0, 0, shift)), t, 0.34, 0.5, 520)
      if (i % 4 === 0) tone('triangle', midi(note(i / 2 + bar, 2, shift)), t, 0.12, 0.35, 2400)
    } else {
      if (i === 0) {
        for (const d of [0, 2, 4]) {
          tone('sine', midi(note(d, 1, shift)), t, 0.16, stepSec * 15, 1600)
        }
      }
      if (i % 4 === 2) tone('triangle', midi(note(i + bar, 2, shift)), t, 0.09, 0.7, 2200)
    }
  }

  function tick() {
    if (!ctx) return
    while (next < ctx.currentTime + 0.18) {
      play(step, next)
      step += 1
      next += stepSec
    }
  }

  return {
    async start() {
      if (!ctx) {
        ctx = new Ctor!()
        const limiter = ctx.createDynamicsCompressor()
        master = ctx.createGain()
        master.gain.value = muted ? 0 : 0.55
        master.connect(limiter).connect(ctx.destination)
        const len = Math.floor(ctx.sampleRate * 0.3)
        noise = ctx.createBuffer(1, len, ctx.sampleRate)
        const data = noise.getChannelData(0)
        for (let k = 0; k < len; k++) data[k] = Math.random() * 2 - 1
      }
      await ctx.resume()
      window.clearInterval(timer)
      step = 0
      next = ctx.currentTime + 0.05
      timer = window.setInterval(tick, 25)
    },
    stop() {
      window.clearInterval(timer)
      timer = 0
      const closing = ctx
      ctx = null
      master = null
      void closing?.close().catch(() => undefined)
    },
    setMuted(value) {
      muted = value
      if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.55, ctx.currentTime, 0.03)
    },
  }
}
