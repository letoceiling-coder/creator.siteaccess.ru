import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useRef, useState } from 'react'
import type { VideoClip } from '@/features/media/use-media.ts'

const ratioStyle: Record<VideoClip['ratio'], string> = {
  '9:16': '9 / 16',
  '16:9': '16 / 9',
  '1:1': '1 / 1',
}

/** Плеер готового ролика: постер, пауза, звук. Звук включается только по нажатию. */
export function ClipPlayer({ clip, title }: { clip: VideoClip; title: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)

  function toggle() {
    const video = ref.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  return (
    <div className="grid gap-3">
      <div
        className="chamfer grain bg-canvas-sunken relative mx-auto w-full overflow-hidden"
        style={{ aspectRatio: ratioStyle[clip.ratio], maxHeight: '68dvh' }}
      >
        <video
          ref={ref}
          src={clip.src}
          poster={clip.poster}
          loop
          playsInline
          preload="metadata"
          muted={muted}
          aria-label={`Демо-ролик «${title}»`}
          className="absolute inset-0 size-full object-cover"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={toggle}
        />
        <span className="tracking-label absolute top-3 left-3 bg-black/45 px-2 py-1 text-[11px] text-white/90 uppercase backdrop-blur-sm">
          Создано ИИ
        </span>
        {!playing ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Смотреть ролик"
            className="absolute inset-0 grid place-items-center bg-black/20"
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
          className="chamfer-sm bg-canvas-raised text-ink hover:bg-canvas-overlay grid size-11 place-items-center"
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        {clip.withMusic ? (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="text-ink hover:bg-wash grid size-11 place-items-center"
          >
            {muted ? (
              <VolumeX size={18} aria-hidden="true" />
            ) : (
              <Volume2 size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
        <span className="text-caption text-ink-muted">Демо {clip.seconds} с</span>
      </div>
    </div>
  )
}
