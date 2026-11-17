import { useEffect, type RefObject } from 'react'

/**
 * Видео без звука играет, пока видно хотя бы наполовину, и встаёт на паузу вне экрана.
 * Не запускается при «уменьшить движение» и в режиме экономии трафика.
 */
export function useInViewAutoplay(ref: RefObject<HTMLVideoElement | null>, enabled = true) {
  useEffect(() => {
    const video = ref.current
    if (!video || !enabled || typeof IntersectionObserver === 'undefined') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData
    if (reduce || saveData) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined)
        else video.pause()
      },
      { threshold: 0.5 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [ref, enabled])
}
