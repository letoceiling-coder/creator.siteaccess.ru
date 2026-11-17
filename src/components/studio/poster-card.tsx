import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { useRef, type PointerEvent } from 'react'
import { useInViewAutoplay } from '@/hooks/use-in-view-autoplay.ts'
import { cn } from '@/shared/cn.ts'

/** Афиша сценария: наклон за пальцем, метки видоискателя, счётчик кадров. */
export function PosterCard({
  title,
  tag,
  frames,
  unit = 'кадров',
  src,
  video,
  index,
  onOpen,
  className,
}: {
  title: string
  tag: string
  frames: number
  unit?: string
  src: string
  /** Короткое превью без звука: играет само, пока карточка на экране. */
  video?: string
  index: number
  onOpen: () => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useInViewAutoplay(videoRef, Boolean(video))
  const rx = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 })
  const ry = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 })
  const shine = useMotionValue(50)
  const transform = useMotionTemplate`perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`
  const glare = useMotionTemplate`radial-gradient(circle at ${shine}% 20%, rgb(255 255 255 / 0.28), transparent 55%)`

  function move(event: PointerEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    ry.set((x - 0.5) * 12)
    rx.set((0.5 - y) * 12)
    shine.set(x * 100)
  }
  function leave() {
    rx.set(0)
    ry.set(0)
    shine.set(50)
  }

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      onPointerMove={move}
      onPointerLeave={leave}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.36, delay: (index % 4) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      style={{ transform }}
      className={cn('chamfer ticks grain group relative block w-full text-left', className)}
    >
      <span className="bg-canvas-sunken relative block aspect-[3/4] overflow-hidden">
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-[360ms] ease-out group-hover:scale-105"
        />
        {video ? (
          <video
            ref={videoRef}
            src={video}
            poster={src}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <motion.span
          className="absolute inset-0 mix-blend-soft-light"
          style={{ background: glare }}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="tracking-label absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[11px] text-white/85 uppercase">
          <span className="bg-black/45 px-2 py-1 backdrop-blur-sm">{tag}</span>
          <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
        </span>
        <span className="absolute inset-x-0 bottom-0 grid gap-1 p-4 text-white">
          <span className="font-display text-title leading-[1.05]">{title}</span>
          <span className="text-caption text-white/75">
            {frames} {unit}
          </span>
        </span>
      </span>
    </motion.button>
  )
}
