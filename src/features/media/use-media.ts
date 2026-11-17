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
  ratio: '9:16' | '16:9' | '1:1'
  seconds: number
  withMusic: boolean
}

export interface Media {
  photos: PhotoLocation[]
  videos: Record<string, VideoClip>
}

const empty: Media = { photos: [], videos: {} }
let cache: Promise<Media> | undefined

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url)
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
  ]).then(([photos, videos]) => ({
    photos: photos?.locations ?? [],
    videos: videos ?? {},
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
