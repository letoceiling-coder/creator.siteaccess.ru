import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createSoundtrack } from '@/features/audio/soundtrack.ts'
import type { VideoTemplate } from '@/features/catalog/video-data.ts'
import { frameStyle as ratioFrame } from './frame-style.ts'

const moves = [
  { x: -3, y: 0 },
  { x: 3, y: -2 },
  { x: 0, y: 3 },
] as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const fmt = (s: number) => `0:${String(Math.floor(s)).padStart(2, '0')}`

/** Плеер превью: ролик из раскадровки с движением камеры, титрами и синтезированной музыкой. */
export function VideoPlayer({ template }: { template: VideoTemplate }) {
  const reduce = useReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [t, setT] = useState(0)
  const clock = useRef({ from: 0, at: 0 })
  const tRef = useRef(0)

  const bright = template.category === 'party' || template.category === 'style'
  const track = useMemo(
    () => createSoundtrack(template.id, template.music.bpm, bright),
    [template.id, template.music.bpm, bright],
  )
  const { seconds, shots } = template
  const slice = seconds / shots.length

  useEffect(() => {
    track?.setMuted(muted)
  }, [track, muted])

  useEffect(() => () => track?.stop(), [track])

  useEffect(() => {
    if (!playing) return
    clock.current = { from: tRef.current, at: performance.now() }
    let raf = 0
    const loop = (now: number) => {
      let next = clock.current.from + (now - clock.current.at) / 1000
      if (next >= seconds) {
        next %= seconds
        clock.current = { from: next, at: now }
        void track?.start()
      }
      tRef.current = next
      setT(next)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, seconds, track])

  function toggle() {
    if (playing) {
      setPlaying(false)
      track?.stop()
    } else {
      setPlaying(true)
      void track?.start()
    }
  }

  function seek(value: number) {
    tRef.current = value
    setT(value)
    clock.current = { from: value, at: performance.now() }
  }

  const shot = clamp(Math.floor(t / slice), 0, shots.length - 1)
  const local = t - shot * slice
  const progress = clamp(local / slice, 0, 1)
  const fade = clamp(local / 0.5, 0, 1)

  function frameStyle(index: number, p: number, opacity: number) {
    const m = moves[index % moves.length] ?? moves[0]
    const k = reduce ? 0 : p
    return {
      opacity,
      transform: `translate(${m.x * k}%, ${m.y * k}%) scale(${reduce ? 1.04 : 1.06 + 0.1 * p})`,
    }
  }

  return (
    <div className="grid gap-3">
      <div
        className="chamfer grain bg-canvas-sunken relative mx-auto w-full overflow-hidden"
        style={ratioFrame(template.ratio)}
      >
        {shot > 0 ? (
          <img
            src={template.frames[shot - 1]}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={frameStyle(shot - 1, 1, 1)}
          />
        ) : null}
        <img
          key={shot}
          src={template.frames[shot] ?? template.cover}
          alt=""
          className="absolute inset-0 size-full object-cover will-change-transform"
          style={frameStyle(shot, progress, shot > 0 ? fade : 1)}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />

        <span className="tracking-label absolute top-3 left-3 bg-black/45 px-2 py-1 text-[11px] text-white/90 uppercase backdrop-blur-sm">
          Превью из раскадровки
        </span>

        {t < 1.4 ? (
          <span
            className="font-display text-display absolute inset-x-0 top-1/3 px-6 text-center leading-[0.95] text-white"
            style={{ opacity: clamp(1.4 - t, 0, 1) }}
          >
            {template.title}
          </span>
        ) : null}

        <p className="text-body absolute inset-x-0 bottom-0 p-4 text-white" aria-live="off">
          <span className="text-accent mr-2 tabular-nums">0{shot + 1}</span>
          {shots[shot]}
        </p>

        {!playing ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Смотреть превью"
            className="group absolute inset-0 grid place-items-center bg-black/20"
          >
            <span className="chamfer bg-accent-fill text-accent-ink breathe grid size-20 place-items-center">
              <Play size={32} aria-hidden="true" className="translate-x-0.5" />
            </span>
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
          className="chamfer-sm bg-canvas-raised text-ink hover:bg-canvas-overlay grid size-11 shrink-0 place-items-center"
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <input
          type="range"
          min={0}
          max={seconds}
          step={0.05}
          value={t}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Перемотка"
          aria-valuetext={`${fmt(t)} из ${fmt(seconds)}`}
          className="accent-accent h-11 min-w-0 flex-1"
        />
        <span className="text-caption text-ink-muted w-16 shrink-0 text-right tabular-nums">
          {fmt(t)} / {fmt(seconds)}
        </span>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={muted}
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
          className="text-ink hover:bg-wash grid size-11 shrink-0 place-items-center"
        >
          {muted ? (
            <VolumeX size={18} aria-hidden="true" />
          ) : (
            <Volume2 size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
