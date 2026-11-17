import { useEffect, useState } from 'react'

export interface PhotoShot {
  kind: string
  label: string
  src: string
  thumb: string
  w: number
  h: number
}

export interface PhotoLocation {
  id: string
  title: string
  shots: PhotoShot[]
}

export interface VideoClip {
  src: string
  poster: string
  /** Превью 6 с без звука для карточки. */
  preview?: string
  ratio: '9:16' | '16:9' | '1:1'
  seconds: number
  withMusic: boolean
}

export interface PhotoStorySamples {
  cover: string
  thumb: string
  shots: { src: string; thumb: string; label: string }[]
}

export interface Media {
  photos: PhotoLocation[]
  videos: Record<string, VideoClip>
  /** Образцы фото-сюжетов каталога по id. */
  photoStories: Record<string, PhotoStorySamples>
}

const empty: Media = { photos: [], videos: {}, photoStories: {} }
let cache: Promise<Media> | undefined

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return undefined
    return (await res.json()) as T
  } catch {
    return undefined
  }
}

/** Образцы, которые делает фабрика контента на сервере (`/media`). Если их нет — пустой набор. */
export function loadMedia(): Promise<Media> {
  cache ??= Promise.all([
    getJson<{ locations: PhotoLocation[] }>('/media/photos/manifest.json'),
    getJson<Record<string, VideoClip>>('/media/video/manifest.json'),
    getJson<{ stories: Record<string, PhotoStorySamples> }>('/media/photo-stories/manifest.json'),
  ]).then(([photos, videos, stories]) => ({
    photos: photos?.locations ?? [],
    videos: videos ?? {},
    photoStories: stories?.stories ?? {},
  }))
  return cache
}

export function useMedia(): Media {
  const [media, setMedia] = useState<Media>(empty)
  useEffect(() => {
    let alive = true
    void loadMedia().then((m) => {
      if (alive) setMedia(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return media
}
